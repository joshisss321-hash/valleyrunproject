const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/auth");
const Registration = require("../models/Registration");
const Event = require("../models/Event");

// GET /api/admin/registrations?eventSlug=xxx&category=5km&search=xxx
router.get("/", protect, async (req, res) => {
  try {
    const { eventSlug, eventId, category, search, medalStatus, page = 1, limit = 200 } = req.query;

    const filter = {};
    if (eventId)     filter.event     = eventId;
    if (eventSlug)   filter.eventSlug = eventSlug;
    if (category)    filter.category  = category;
    if (medalStatus) filter.medalStatus = medalStatus;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let regs = await Registration.find(filter)
      .populate("user",  "name email phone address1 address2 landmark city state pincode")
      .populate("event", "title slug dates")
      .sort({ createdAt: -1 })
      .lean();

    // Search filter on populated user
    if (search) {
      const q = search.toLowerCase();
      regs = regs.filter(r =>
        (r.user?.name  || "").toLowerCase().includes(q) ||
        (r.user?.email || "").toLowerCase().includes(q) ||
        (r.user?.phone || "").includes(q)
      );
    }

    const total    = regs.length;
    const paginated = regs.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      registrations: paginated,
      total,
      pagination: { page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/registrations/export/:eventSlug — full data for Excel
router.get("/export/:eventSlug", protect, async (req, res) => {
  try {
    const regs = await Registration.find({ eventSlug: req.params.eventSlug })
      .populate("user",  "name email phone address1 address2 landmark city state pincode")
      .populate("event", "title slug")
      .sort({ createdAt: 1 })
      .lean();

    const rows = regs.map((r, i) => ({
      sr:          i + 1,
      name:        r.user?.name      || "",
      email:       r.user?.email     || "",
      phone:       r.user?.phone     || "",
      category:    r.category        || "",
      address1:    r.user?.address1  || "",
      address2:    r.user?.address2  || "",
      landmark:    r.user?.landmark  || "",
      city:        r.user?.city      || "",
      state:       r.user?.state     || "",
      pincode:     r.user?.pincode   || "",
      amount:      r.amount          || "",
      paymentId:   r.paymentId       || "",
      orderId:     r.orderId         || "",
      medalStatus: r.medalStatus     || "pending",
      trackingId:  r.trackingId      || "",
      date:        r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "",
    }));

    res.json({
      success: true,
      event:   regs[0]?.event?.title || req.params.eventSlug,
      total:   rows.length,
      rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/registrations/:id/medal-status  { medalStatus, trackingId }
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
