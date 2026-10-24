const express = require("express");
const mongoose = require("mongoose");

const Notification = require("../models/Notification");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware);

// GET: Fetch logged-in user's notifications
router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.userId,
    })
      .populate("incident", "type location severity status")
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      notifications,
      unreadCount: notifications.filter((n) => !n.readAt).length,
    });
  } catch (error) {
    console.error("Fetch notifications error:", error);
    res.status(500).json({ message: "Failed to fetch notifications." });
  }
});

// POST: Admin sends an emergency alert to all responders
router.post("/broadcast", requireRole("admin"), async (req, res) => {
  try {
    const title =
      typeof req.body.title === "string" ? req.body.title.trim() : "";

    const message =
      typeof req.body.message === "string" ? req.body.message.trim() : "";

    const severity = req.body.severity || "critical";

    if (!title || title.length > 160) {
      return res.status(400).json({
        message: "Title is required and must be at most 160 characters.",
      });
    }

    if (!message || message.length > 500) {
      return res.status(400).json({
        message: "Message is required and must be at most 500 characters.",
      });
    }

    if (!["info", "warning", "critical"].includes(severity)) {
      return res.status(400).json({
        message: "Invalid alert severity.",
      });
    }

    const responders = await User.find({ role: "responder" })
      .select("_id")
      .lean();

    if (responders.length === 0) {
      return res.status(200).json({
        message: "No responders are registered yet.",
        sentCount: 0,
      });
    }

    const broadcastId = new mongoose.Types.ObjectId();
    const notifications = await Notification.insertMany(
      responders.map((responder) => ({
        recipient: responder._id,
        broadcastId,
        incident: null,
        title,
        message,
        severity,
      }))
    );

    // Send a real-time notification to each responder
    const io = req.app.get("io");

    if (io) {
      notifications.forEach((notification) => {
        io.to(`user:${notification.recipient.toString()}`).emit(
          "notification:new",
          notification
        );
      });

      // Also emit an alert event for clients that listen for broadcasts
      io.to("role:responder").emit("emergency:broadcast", {
        title,
        message,
        severity,
        createdAt: new Date(),
      });
    }

    AuditLog.create({ actor:req.user.userId, action:"alert.broadcast", details:{broadcastId, sentCount:notifications.length} }).catch(console.error);
    return res.status(201).json({
      message: "Emergency alert sent to all responders.",
      sentCount: notifications.length,
      broadcastId,
    });
  } catch (error) {
    console.error("Broadcast emergency alert error:", error);
    return res.status(500).json({
      message: "Failed to send emergency alert.",
    });
  }
});

// Admin dashboard: latest broadcast notifications and responder statuses.
router.get("/tracking", requireRole("admin"), async (_req,res)=>{
  try {
    const notifications=await Notification.find({broadcastId:{$ne:null}}).populate("recipient","name email role").sort({createdAt:-1}).limit(300).lean();
    res.json({notifications});
  } catch(error){console.error(error);res.status(500).json({message:"Unable to load alert tracking."});}
});

// PATCH: Responder acknowledges an emergency notification
router.patch("/:id/acknowledge", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid notification ID.",
      });
    }

    // Only the notification's recipient can acknowledge it.
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        recipient: req.user.userId,
      },
      {
        $set: {
          acknowledgedAt: new Date(),
          readAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found.",
      });
    }

    AuditLog.create({actor:req.user.userId,action:"alert.acknowledge",details:{notificationId:notification._id}}).catch(console.error);
    // Notify admins that the responder acknowledged the alert.
    const io = req.app.get("io");

    if (io) {
      io.to("role:admin").emit("notification:acknowledged", {
        notificationId: notification._id,
        responderId: notification.recipient,
        acknowledgedAt: notification.acknowledgedAt,
        title: notification.title,
        severity: notification.severity,
      });
    }

    return res.json({
      message: "Emergency alert acknowledged.",
      notification,
    });
  } catch (error) {
    console.error("Acknowledge notification error:", error);

    return res.status(500).json({
      message: "Failed to acknowledge notification.",
    });
  }
});

// PATCH: Mark one notification as read
router.patch("/:id/read", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid notification ID.",
      });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        recipient: req.user.userId,
      },
      { readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found.",
      });
    }

    res.json({
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    console.error("Mark notification read error:", error);
    res.status(500).json({
      message: "Failed to update notification.",
    });
  }
});

// PATCH: Mark all notifications as read
router.patch("/read-all", async (req, res) => {
  try {
    await Notification.updateMany(
      {
        recipient: req.user.userId,
        readAt: null,
      },
      { readAt: new Date() }
    );

    res.json({
      message: "Notifications marked as read.",
    });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    res.status(500).json({
      message: "Failed to update notifications.",
    });
  }
});

module.exports = router;

