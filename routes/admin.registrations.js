const express = require("express");
const router  = express.Router();
const mongoose = require("mongoose");
const { protect } = require("../middleware/auth");
const Registration = require("../models/Registration");
const Event = require("../models/Event");

// GET /api/admin/registrations?eventId=xxx&eventSlug=xxx&search=xxx
router.get("/", protect, async (req, res) => {
  try {
    const { eventSlug, eventId, category, search, medalStatus, page = 1, limit = 200 } = req.query;

    const filter = {};

    if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
      filter.event = new mongoose.Types.ObjectId(eventId);
    } else if (eventSlug) {
      const ev = await Event.findOne({ slug: eventSlug });
      if (ev) filter.event = ev._id;
    }

    if (category)    filter.category    = category;
    if (medalStatus) filter.medalStatus = medalStatus;

    let regs = await Registration.find(filter)
      .populate("user",  "name email phone address1 address2 landmark city state pincode")
      .populate("event", "title slug dates")
      .sort({ createdAt: -1 })
      .lean();

    if (search) {
      const q = search.toLowerCase();
      regs = regs.filter(r =>
        (r.user?.name  || "").toLowerCase().includes(q) ||
        (r.user?.email || "").toLowerCase().includes(q) ||
        (r.user?.phone || "").includes(q)
      );
    }

    const skip      = (parseInt(page) - 1) * parseInt(limit);
    const total     = regs.length;
    const paginated = regs.slice(skip, skip + parseInt(limit));

    res.json({ success: true, registrations: paginated, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/registrations/export/:eventSlug
router.get("/export/:eventSlug", protect, async (req, res) => {
  try {
    const event = await Event.findOne({ slug: req.params.eventSlug });

    const regs = await Registration.find(
      event ? { event: event._id } : { eventSlug: req.params.eventSlug }
    )
      .populate("user",  "name email phone address1 address2 landmark city state pincode")
      .sort({ createdAt: 1 })
      .lean();

    const rows = regs.map((r, i) => ({
      sr:          i + 1,
      name:        r.user?.name     || "",
      email:       r.user?.email    || "",
      phone:       r.user?.phone    || "",
      category:    r.category       || "",
      address1:    r.user?.address1 || "",
      address2:    r.user?.address2 || "",
      landmark:    r.user?.landmark || "",
      city:        r.user?.city     || "",
      state:       r.user?.state    || "",
      pincode:     r.user?.pincode  || "",
      amount:      r.amount         || "",
      paymentId:   r.paymentId      || "",
      orderId:     r.orderId        || "",
      medalStatus: r.medalStatus    || "pending",
      trackingId:  r.trackingId     || "",
      date:        r.createdAt
        ? new Date(r.createdAt).toLocaleDateString("en-IN")
        : "",
    }));

    res.json({ success: true, event: event?.title || req.params.eventSlug, total: rows.length, rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/registrations/:id/medal-status
router.patch("/:id/medal-status", protect, async (req, res) => {
  try {
    const { medalStatus, trackingId } = req.body;
    const reg = await Registration.findByIdAndUpdate(
      req.params.id,
      { medalStatus, ...(trackingId ? { trackingId } : {}) },
      { new: true }
    );
    if (!reg) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, registration: reg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;