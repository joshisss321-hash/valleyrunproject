const User = require("../models/User");
const { verifyUserToken } = require("../utils/userToken");

const readToken = (req) => {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
};

/**
 * Route ko login-only banata hai. req.user set karta hai.
 */
const protectUser = async (req, res, next) => {
  try {
    const token = readToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "Please login to continue" });
    }

    const decoded = verifyUserToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Session expire ho gaya. Dobara login karein." });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: "Account nahi mila" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("protectUser error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Login optional — token ho to req.user set, na ho to bhi aage badho.
 * Coupon validate jaise public routes ke liye.
 */
const optionalUser = async (req, _res, next) => {
  try {
    const token = readToken(req);
    if (token) {
      const decoded = verifyUserToken(token);
      if (decoded) req.user = await User.findById(decoded.id);
    }
  } catch {
    /* optional hai — fail hone pe bhi aage badho */
  }
  next();
};

module.exports = { protectUser, optionalUser };
