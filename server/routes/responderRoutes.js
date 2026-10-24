const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Incident = require("../models/Incident");
const Notification = require("../models/Notification");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const router = express.Router();
router.use(authMiddleware);

// Only admins can view the responder directory.
router.get("/", requireRole("admin"), async (_req, res) => {
  const responders = await User.find({ role: "responder" }).select("name email createdAt").sort({ name: 1 });
  res.json({ responders });
});

// Admin directory: accounts can be promoted/demoted as responders.
router.get("/directory", requireRole("admin"), async (_req, res) => {
  const users = await User.find({ role: { $in: ["user", "responder"] } })
    .select("name email role createdAt").sort({ name: 1 });
  res.json({ users });
});

// Admin can promote a registered account to responder (never via public signup).
router.patch("/:userId/role", requireRole("admin"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ message: "Invalid user ID." });
    const { role } = req.body;
    if (!["user", "responder"].includes(role)) return res.status(400).json({ message: "Role must be user or responder." });
    const user = await User.findByIdAndUpdate(req.params.userId, { role }, { new: true, runValidators: true }).select("name email role");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json({ message: `User role updated to ${role}.`, user });
  } catch (error) {
    res.status(500).json({ message: "Could not update user role." });
  }
});

// Responder sees only their assigned work; admins can see the full queue.
router.get("/my-assignments", requireRole("responder", "admin"), async (req, res) => {
  const query = req.user.role === "admin" ? { assignedTo: { $ne: null } } : { assignedTo: req.user.userId };
  const incidents = await Incident.find(query).populate("assignedTo", "name email").populate("reportedBy", "name email").sort({ updatedAt: -1 });
  res.json({ incidents });
});

module.exports = router;
