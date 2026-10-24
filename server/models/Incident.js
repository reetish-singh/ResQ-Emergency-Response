const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "Medical Emergency",
        "Fire",
        "Road Accident",
        "Crime or Security Threat",
        "Natural Disaster",
        "Rescue Request",
        "Other",
      ],
    },

    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    latitude: {
      type: Number,
      default: null,
    },

    longitude: {
      type: Number,
      default: null,
    },

    severity: {
      type: String,
      required: true,
      enum: ["Critical", "High", "Medium", "Low"],
      default: "High",
    },

    status: {
      type: String,
      enum: ["Pending", "Dispatched", "Resolved"],
      default: "Pending",
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 25,
      default: "",
    },

    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    responseStatus: {
      type: String,
      enum: ["Unassigned", "Assigned", "On the Way", "On Scene", "Completed"],
      default: "Unassigned",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Incident", incidentSchema);