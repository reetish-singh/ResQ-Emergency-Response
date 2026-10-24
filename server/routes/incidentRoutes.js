
const express = require("express");
const mongoose = require("mongoose");

const Incident = require("../models/Incident");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");
const User = require("../models/User");
const Notification = require("../models/Notification");

const router = express.Router();

// All routes below require a valid login.
router.use(authMiddleware);

// Emit real-time events through Socket.IO.
function emitRealtime(req, event, payload, room = null) {
  const io = req.app.get("io");

  if (!io) {
    console.warn(`Socket.IO unavailable; skipped event: ${event}`);
    return;
  }

  if (room) {
    io.to(room).emit(event, payload);
  } else {
    io.emit(event, payload);
  }
}

// GET: Retrieve incidents.
router.get("/", async (req, res) => {
  try {
    const incidents = await Incident.find()
      .sort({ createdAt: -1 })
      .populate("reportedBy", "name email");

    res.json({ incidents });
  } catch (error) {
    console.error("Fetch incidents error:", error.message);

    res.status(500).json({
      message: "Could not retrieve incidents.",
    });
  }
});

// POST: Suggest incident category and severity from description (transparent rule-based assistance).
// This is decision support only: the reporter/operator must review and choose the final values.
router.post("/classify", async (req, res) => {
  try {
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    if (!description) {
      return res.status(400).json({ message: "Enter an incident description first." });
    }
    if (description.length > 2000) {
      return res.status(400).json({ message: "Description must be 2000 characters or fewer." });
    }

    const text = description.toLowerCase();
    const rules = [
      { type: "Medical Emergency", severity: "Critical", terms: ["not breathing", "unconscious", "heart attack", "severe bleeding", "chest pain", "stroke", "not responsive"] },
      { type: "Fire", severity: "Critical", terms: ["building on fire", "fire spreading", "trapped in fire", "explosion", "gas leak", "smoke filling"] },
      { type: "Road Accident", severity: "High", terms: ["car crash", "road accident", "vehicle collision", "bike accident", "hit by a car", "traffic collision"] },
      { type: "Natural Disaster", severity: "High", terms: ["flood", "earthquake", "landslide", "cyclone", "building collapse", "severe storm"] },
      { type: "Crime or Security Threat", severity: "High", terms: ["weapon", "armed person", "break-in", "intruder", "assault", "threatening people"] },
      { type: "Rescue Request", severity: "High", terms: ["trapped", "stranded", "stuck on roof", "missing person", "need rescue", "cannot get out"] },
    ];
    const match = rules.find((rule) => rule.terms.some((term) => text.includes(term)));
    const suggestion = match
      ? { type: match.type, severity: match.severity, confidence: "keyword-match", matchedTerms: match.terms.filter((term) => text.includes(term)) }
      : { type: "Other", severity: "Medium", confidence: "fallback", matchedTerms: [] };

    return res.json({
      suggestion,
      method: "rule-based",
      disclaimer: "Suggestion only, not a diagnosis or emergency decision. Review the details and select the final category and severity yourself. If there is immediate danger, contact local emergency services."
    });
  } catch (error) {
    console.error("Incident classification error:", error.message);
    return res.status(500).json({ message: "Could not suggest incident classification." });
  }
});

// POST: Create an incident and notify admin/responder accounts.
router.post("/", async (req, res) => {
  try {
    const {
      type,
      location,
      latitude,
      longitude,
      severity,
      description,
      phone,
    } = req.body;

    if (
      typeof type !== "string" ||
      !type.trim() ||
      typeof location !== "string" ||
      !location.trim() ||
      typeof description !== "string" ||
      !description.trim()
    ) {
      return res.status(400).json({
        message: "Type, location and description are required.",
      });
    }

    if (
      latitude != null &&
      (typeof latitude !== "number" ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90)
    ) {
      return res.status(400).json({
        message: "Invalid latitude.",
      });
    }

    if (
      longitude != null &&
      (typeof longitude !== "number" ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180)
    ) {
      return res.status(400).json({
        message: "Invalid longitude.",
      });
    }

    const incident = await Incident.create({
      type: type.trim(),
      location: location.trim(),
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      severity,
      description: description.trim(),
      phone: typeof phone === "string" ? phone.trim() : "",
      reportedBy: req.user.userId,
    });

    // Create a persistent notification for each admin and responder.
    const recipients = await User.find({
      role: { $in: ["admin", "responder"] },
    }).select("_id");

    if (recipients.length > 0) {
      const notifications = await Notification.insertMany(
        recipients.map((recipient) => ({
          recipient: recipient._id,
          incident: incident._id,
          title:
            incident.severity === "Critical"
              ? "Critical incident reported"
              : "New emergency reported",
          message: `${incident.type} reported at ${incident.location}.`,
          severity:
            incident.severity === "Critical"
              ? "critical"
              : incident.severity === "High"
                ? "warning"
                : "info",
        }))
      );

      // Send notifications only to each intended user's room.
      for (const notification of notifications) {
        emitRealtime(
          req,
          "notification:new",
          notification,
          `user:${String(notification.recipient)}`
        );
      }
    }

    // Broadcast the incident to connected dashboards.
    emitRealtime(req, "incident:created", { incident });

    // Send a separate event for critical emergencies.
    if (incident.severity === "Critical") {
      emitRealtime(req, "critical-incident", {
        incident,
        message: `${incident.type} reported at ${incident.location}.`,
      });
    }

    return res.status(201).json({
      message: "Emergency report created successfully.",
      incident,
    });
  } catch (error) {
    console.error("Create incident error:", error.message);

    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({
        message: "Invalid incident details.",
      });
    }

    return res.status(500).json({
      message: "Could not create emergency report.",
    });
  }
});

// PATCH: Update incident status.
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid incident ID.",
      });
    }

    if (!["Pending", "Dispatched", "Resolved"].includes(status)) {
      return res.status(400).json({
        message: "Invalid incident status.",
      });
    }

    const incident = await Incident.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!incident) {
      return res.status(404).json({
        message: "Incident not found.",
      });
    }

    emitRealtime(req, "incident:updated", { incident });

    return res.json({
      message: "Incident status updated.",
      incident,
    });
  } catch (error) {
    console.error("Update status error:", error.message);

    return res.status(500).json({
      message: "Could not update incident status.",
    });
  }
});

// ADMIN: Assign an incident to a registered responder.
router.patch("/:id/assign", requireRole("admin"), async (req, res) => {
  try {
    const { responderId } = req.body;

    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !mongoose.isValidObjectId(responderId)
    ) {
      return res.status(400).json({
        message: "Valid incident and responder IDs are required.",
      });
    }

    const responder = await User.findOne({
      _id: responderId,
      role: "responder",
    }).select("_id name email");

    if (!responder) {
      return res.status(404).json({
        message: "Responder account not found.",
      });
    }

    const incident = await Incident.findByIdAndUpdate(
      req.params.id,
      {
        assignedTo: responder._id,
        responseStatus: "Assigned",
        status: "Dispatched",
      },
      { new: true, runValidators: true }
    ).populate("assignedTo", "name email");

    if (!incident) {
      return res.status(404).json({
        message: "Incident not found.",
      });
    }

    const notification = await Notification.create({
      recipient: responder._id,
      incident: incident._id,
      title: "Emergency assigned to you",
      message: `${incident.type} at ${incident.location} has been assigned to you.`,
      severity:
        incident.severity === "Critical" ? "critical" : "warning",
    });

    emitRealtime(
      req,
      "notification:new",
      notification,
      `user:${String(responder._id)}`
    );

    emitRealtime(
      req,
      "responder:assigned",
      {
        incident,
        message: `An emergency at ${incident.location} has been assigned to you.`,
      },
      `user:${String(responder._id)}`
    );

    emitRealtime(req, "incident:updated", { incident });

    return res.json({
      message: "Responder assigned successfully.",
      incident,
    });
  } catch (error) {
    console.error("Assign responder error:", error.message);

    return res.status(500).json({
      message: "Could not assign responder.",
    });
  }
});

// ADMIN or assigned RESPONDER: Update response progress.
router.patch(
  "/:id/response-status",
  requireRole("admin", "responder"),
  async (req, res) => {
    try {
      const { responseStatus } = req.body;

      const allowed = [
        "Assigned",
        "On the Way",
        "On Scene",
        "Completed",
      ];

      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid incident ID.",
        });
      }

      if (!allowed.includes(responseStatus)) {
        return res.status(400).json({
          message: "Invalid response status.",
        });
      }

      const incident = await Incident.findById(req.params.id);

      if (!incident) {
        return res.status(404).json({
          message: "Incident not found.",
        });
      }

      if (
        req.user.role !== "admin" &&
        String(incident.assignedTo) !== String(req.user.userId)
      ) {
        return res.status(403).json({
          message: "You can update only incidents assigned to you.",
        });
      }

      incident.responseStatus = responseStatus;

      if (responseStatus === "Completed") {
        incident.status = "Resolved";
      } else if (incident.status === "Pending") {
        incident.status = "Dispatched";
      }

      await incident.save();

      emitRealtime(req, "incident:updated", { incident });

      return res.json({
        message: "Response status updated.",
        incident,
      });
    } catch (error) {
      console.error("Response status error:", error.message);

      return res.status(500).json({
        message: "Could not update response status.",
      });
    }
  }
);

// DELETE: Delete an incident.
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid incident ID.",
      });
    }

    const incident = await Incident.findByIdAndDelete(req.params.id);

    if (!incident) {
      return res.status(404).json({
        message: "Incident not found.",
      });
    }

    emitRealtime(req, "incident:deleted", {
      incidentId: String(incident._id),
    });

    return res.json({
      message: "Incident deleted successfully.",
    });
  } catch (error) {
    console.error("Delete incident error:", error.message);

    return res.status(500).json({
      message: "Could not delete incident.",
    });
  }
});

module.exports = router;

