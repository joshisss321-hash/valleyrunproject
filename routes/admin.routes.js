const express = require("express");
const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const { protectAdmin } = require("../middlewares/adminAuth");

const router = express.Router();

/* ===============================
   ADMIN LOGIN
================================ */
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (
    email !== process.env.ADMIN_EMAIL ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin credentials",
    });
  }

  const token = jwt.sign(
    { role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    success: true,
    token,
  });
});

/* ===============================
   GET ALL EVENTS (ADMIN)
================================ */
router.get("/events", protectAdmin, async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ===============================
   GET SINGLE EVENT (EDIT PAGE)
================================ */
router.get("/events/:id", protectAdmin, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ===============================
   UPDATE EVENT
================================ */
router.put("/events/:id", protectAdmin, async (req, res) => {
  try {
    const updated = await Event.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({ success: true, event: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Update failed" });
  }
});

module.exports = router;
