// backend/middlewares/adminAuth.js
// Ye file already aapke project mein hai — isko is code se replace karo

const jwt = require("jsonwebtoken");

const adminAuth = (req, res, next) => {
  try {
    // Token header se lo: "Bearer <token>"
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Access denied. No token." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Sirf admin role allow karo
    if (decoded.role !== "admin") {
      return res.status(403).json({ success: false, message: "Forbidden. Admins only." });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
};

module.exports = adminAuth;
