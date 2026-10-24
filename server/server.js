
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const incidentRoutes = require("./routes/incidentRoutes");
const responderRoutes = require("./routes/responderRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const operationsRoutes = require("./routes/operationsRoutes");
const Notification = require("./models/Notification");
const AuditLog = require("./models/AuditLog");

const app = express();
const httpServer = http.createServer(app);

const PORT = process.env.PORT || 5000;

const allowedOrigins = (
  process.env.CLIENT_ORIGINS ||
  "http://localhost:5173,http://localhost:5178,http://localhost:5179"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Express CORS
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Origin is not allowed by ResQ CORS policy.")
      );
    },
  })
);

app.use(express.json());

// Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  },
});

app.set("io", io);

// Authenticate every Socket.IO connection with the existing JWT.
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication required."));
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing from server/.env");
      return next(new Error("Authentication service unavailable."));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Support the common user ID claim names used by JWT payloads.
    const userId =
      decoded.userId ||
      decoded.id ||
      decoded._id ||
      decoded.sub;

    if (
      typeof userId !== "string" ||
      !mongoose.isValidObjectId(userId)
    ) {
      return next(new Error("Invalid authentication token."));
    }

    socket.data.userId = userId;

    // Role comes from the verified JWT, never from a client event.
    socket.data.role =
      typeof decoded.role === "string"
        ? decoded.role.toLowerCase()
        : null;

    next();
  } catch (error) {
    console.warn("Socket.IO authentication failed:", error.message);
    next(new Error("Invalid or expired authentication token."));
  }
});

io.on("connection", (socket) => {
  const { userId, role } = socket.data;

  // A verified connection may join only its own user room.
  socket.join(`user:${userId}`);

  // Only a role contained in the verified JWT can join a role room.
  if (role === "admin" || role === "responder") {
    socket.join(`role:${role}`);
  }

  console.log("Authenticated ResQ client connected:", socket.id);

  // Do not accept client-controlled join-user-room or join-role-room events.

  socket.on("disconnect", (reason) => {
    console.log("ResQ client disconnected:", socket.id, reason);
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/responders", responderRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/operations", operationsRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "ResQ Emergency Response API is running!",
    realtime: "Socket.IO enabled",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    service: "ResQ Backend",
    database:
      mongoose.connection.readyState === 1
        ? "Connected"
        : "Disconnected",
    realtime: "Enabled",
    connectedClients: io.engine.clientsCount,
  });
});

// Express error handler
app.use((err, req, res, next) => {
  console.error("API error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    message: "An unexpected server error occurred.",
  });
});

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from server/.env");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from server/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB connected successfully!");

    // Escalate unacknowledged broadcast notifications after configurable timeout.
    const escalationSeconds = Math.max(30,Number(process.env.ESCALATION_SECONDS)||120);
    setInterval(async()=>{
      try{
        const pending=await Notification.find({broadcastId:{$ne:null},acknowledgedAt:null,escalatedAt:null,createdAt:{$lte:new Date(Date.now()-escalationSeconds*1000)}}).limit(100);
        for(const alert of pending){
          const result=await Notification.updateOne({_id:alert._id,escalatedAt:null,acknowledgedAt:null},{$set:{escalatedAt:new Date()}});
          if(result.modifiedCount){io.to("role:admin").emit("alert:escalated",{notificationId:alert._id,title:alert.title,recipient:alert.recipient});await AuditLog.create({action:"alert.escalated",details:{notificationId:alert._id}});}
        }
      }catch(error){console.error("Escalation check failed:",error.message);}
    },15000).unref();
    httpServer.listen(PORT, () => {
      console.log(`ResQ backend running at http://localhost:${PORT}`);
      console.log("JWT-authenticated Socket.IO is enabled.");
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
}

async function shutdown() {
  console.log("Shutting down ResQ backend...");

  httpServer.close(async () => {
    try {
      await mongoose.disconnect();
      console.log("MongoDB disconnected.");
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error.message);
      process.exit(1);
    }
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();

