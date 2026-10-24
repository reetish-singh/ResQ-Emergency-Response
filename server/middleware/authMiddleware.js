const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function authMiddleware(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) return res.status(500).json({ message: "Authentication configuration error." });

    const decoded = jwt.verify(authorization.slice(7), secret, {
      issuer: "resq-api",
      audience: "resq-client",
    });

    const user = await User.findById(decoded.userId).select("_id name email role");
    if (!user) return res.status(401).json({ message: "Account no longer exists." });

    req.user = { userId: user._id.toString(), name: user.name, email: user.email, role: user.role };
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired authentication token." });
  }
};
