const express = require("express");
const Event = require("../models/Event");

const router = express.Router();

/* ===============================
   GET ALL EVENTS (PUBLIC)
================================ */
router.get("/", async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load events" });
  }
});

/* ===============================
   GET SINGLE EVENT BY SLUG
================================ */
router.get("/:slug", async (req, res) => {
  try {
    const event = await Event.findOne({ slug: req.params.slug });
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
