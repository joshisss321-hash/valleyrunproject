// const express = require("express");
// const Event = require("../models/Event");

// const router = express.Router();

// /* ===============================
//    GET ALL EVENTS (PUBLIC)
// ================================ */
// router.get("/", async (req, res) => {
//   try {
//     const events = await Event.find().sort({ createdAt: -1 });
//     res.json({ success: true, events });
//   } catch (err) {
//     res.status(500).json({ success: false, message: "Failed to load events" });
//   }
// });

// /* ===============================
//    GET SINGLE EVENT BY SLUG
// ================================ */
// router.get("/:slug", async (req, res) => {
//   try {
//     const event = await Event.findOne({ slug: req.params.slug });
//     if (!event) {
//       return res.status(404).json({ success: false, message: "Event not found" });
//     }
//     res.json({ success: true, event });
//   } catch (err) {
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// module.exports = router;
const express = require("express");
const Event = require("../models/Event");
const { withPricing } = require("../utils/pricing");

const router = express.Router();

/* ===============================
   GET ALL EVENTS (PUBLIC)
================================ */
router.get("/", async (req, res) => {
  try {

    // 🔥 Only active events
    const events = await Event.find({ active: true }).sort({ createdAt: -1 }).lean();

    /* `price` par abhi wala daam — early bird khatam ho gaya to nayi keemat.
       Isse har page apne aap sahi daam dikhata hai, alag se hisaab nahi. */
    res.json({ success: true, events: events.map(withPricing) });

  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load events" });
  }
});

/* ===============================
   GET SINGLE EVENT BY SLUG
================================ */
router.get("/:slug", async (req, res) => {
  try {
    const event = await Event.findOne({ slug: req.params.slug }).lean();

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    res.json({ success: true, event: withPricing(event) });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;