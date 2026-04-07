const express = require("express");
const Leaderboard = require("../models/Leaderboard");
const Event = require("../models/Event"); // Event model import karo

const router = express.Router();

/* ===============================
   GET LEADERBOARD BY EVENT SLUG
================================ */
router.get("/:slug", async (req, res) => {
  try {
    // Pehle slug se event dhundho
    const event = await Event.findOne({ slug: req.params.slug });

    if (!event) {
      return res.json({ success: true, rows: [] });
    }

    // Phir us event ki leaderboard entries fetch karo
    const rows = await Leaderboard.find({
      event: event._id,
    }).sort({ createdAt: 1 });

    res.json({
      success: true,
      rows,
    });
  } catch (err) {
    console.error("Leaderboard fetch error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load leaderboard",
    });
  }
});

module.exports = router;