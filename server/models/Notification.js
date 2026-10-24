const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    incident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
    },

    title: {
      type: String,
      required: true,
      maxlength: 160,
    },

    message: {
      type: String,
      required: true,
      maxlength: 500,
    },

    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
    },

    broadcastId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    escalatedAt: { type: Date, default: null },
    readAt: {
      type: Date,
      default: null,
    },

    // Responder acknowledgment tracking
    acknowledgedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);