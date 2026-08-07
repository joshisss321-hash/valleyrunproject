const express = require("express");
const router  = express.Router();

const { protect }  = require("../middleware/auth");
const Event        = require("../models/Event");
const Registration = require("../models/Registration");
const sendEmail    = require("../utils/sendEmail");
const dispatchedEmail = require("../utils/emailTemplates/medalDispatched");
const {
  normalisePhone,
  buildTrackingUrl,
  courierName,
  supportedCouriers,
} = require("../utils/tracking");

const SITE_URL = process.env.SITE_URL || "https://valleyrun.in";

/* ═══════════════════════════════════════════════════════════
   Sheet frontend par parse hoti hai (xlsx wahan pehle se hai),
   yahan sirf JSON rows aate hain:
     [{ phone, trackingId, courier }, ...]
═══════════════════════════════════════════════════════════ */

/** Rows ko event ki registrations se match karta hai. */
const matchRows = async (eventSlug, rows) => {
  const event = await Event.findOne({ slug: eventSlug });
  if (!event) return { error: "Event not found" };

  const registrations = await Registration.find({ event: event._id })
    .populate("user", "name email phone")
    .lean();

  // phone (last 10 digits) → registration
  const byPhone = new Map();
  registrations.forEach((reg) => {
    const key = normalisePhone(reg.user?.phone);
    if (key) byPhone.set(key, reg);
  });

  const matched  = [];
  const notFound = [];
  const invalid  = [];
  const seen     = new Set();

  rows.forEach((row, index) => {
    const rowNo      = index + 2; // sheet mein header row 1 hoti hai
    const phone      = normalisePhone(row.phone);
    const trackingId = String(row.trackingId || "").trim();
    const courier    = String(row.courier || "").trim();

    if (!phone || !trackingId) {
      invalid.push({
        rowNo,
        phone: row.phone || "",
        trackingId,
        reason: !phone ? "Phone missing or invalid" : "Tracking ID missing",
      });
      return;
    }

    if (seen.has(phone)) {
      invalid.push({ rowNo, phone, trackingId, reason: "Duplicate phone in sheet" });
      return;
    }
    seen.add(phone);

    const reg = byPhone.get(phone);
    if (!reg) {
      notFound.push({ rowNo, phone, trackingId, reason: "No registration found for this event" });
      return;
    }

    matched.push({
      rowNo,
      registrationId: String(reg._id),
      name:           reg.user?.name  || "",
      email:          reg.user?.email || "",
      phone,
      bibNumber:      reg.bibNumber || "",
      currentStatus:  reg.medalStatus || "pending",
      alreadyHasTracking: Boolean(reg.trackingId),
      trackingId,
      courier:        courierName(courier),
      trackingUrl:    buildTrackingUrl(courier, trackingId),
      courierKnown:   Boolean(buildTrackingUrl(courier, trackingId)),
    });
  });

  return { event, matched, notFound, invalid };
};

/* ═══════════════════════════════════════════════════════════
   POST /api/admin/tracking/preview
   Kuch bhi save nahi karta — sirf batata hai kya hoga
═══════════════════════════════════════════════════════════ */
router.post("/preview", protect, async (req, res) => {
  try {
    const { eventSlug, rows } = req.body;

    if (!eventSlug || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: "eventSlug and rows are both required" });
    }

    const result = await matchRows(eventSlug, rows);
    if (result.error) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success:  true,
      event:    result.event.title,
      summary: {
        total:      rows.length,
        matched:    result.matched.length,
        notFound:   result.notFound.length,
        invalid:    result.invalid.length,
        overwrites: result.matched.filter((m) => m.alreadyHasTracking).length,
        unknownCourier: result.matched.filter((m) => !m.courierKnown).length,
      },
      matched:  result.matched,
      notFound: result.notFound,
      invalid:  result.invalid,
      supportedCouriers,
    });
  } catch (err) {
    console.error("tracking preview error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/admin/tracking/commit
   Body: { eventSlug, rows, notify = true, overwrite = false }
═══════════════════════════════════════════════════════════ */
router.post("/commit", protect, async (req, res) => {
  try {
    const { eventSlug, rows, notify = true, overwrite = false } = req.body;

    if (!eventSlug || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: "eventSlug and rows are both required" });
    }

    const result = await matchRows(eventSlug, rows);
    if (result.error) {
      return res.status(404).json({ success: false, message: result.error });
    }

    const toApply = overwrite
      ? result.matched
      : result.matched.filter((m) => !m.alreadyHasTracking);

    const skipped = result.matched.length - toApply.length;
    const now     = new Date();

    let updated = 0;
    const emailQueue = [];

    for (const row of toApply) {
      const update = await Registration.updateOne(
        { _id: row.registrationId },
        {
          $set: {
            trackingId:   row.trackingId,
            courier:      row.courier,
            trackingUrl:  row.trackingUrl,
            medalStatus:  "dispatched",
            dispatchedAt: now,
          },
          $push: {
            statusHistory: {
              status: "dispatched",
              note:   `${row.courier || "Courier"} — ${row.trackingId}`,
              at:     now,
            },
          },
        }
      );

      if (update.modifiedCount > 0) {
        updated++;
        if (notify && row.email) emailQueue.push(row);
      }
    }

    // ✅ Response pehle bhejo — emails background mein
    res.json({
      success: true,
      message: `${updated} medals marked as dispatched`,
      updated,
      skipped,
      notFound: result.notFound.length,
      invalid:  result.invalid.length,
      emailsQueued: emailQueue.length,
    });

    /* ── Emails: ek-ek karke, thoda gap ke saath (Brevo rate limit) ── */
    setImmediate(async () => {
      for (const row of emailQueue) {
        try {
          await sendEmail({
            to:      row.email,
            subject: `📦 Your medal has been dispatched – ${result.event.title}`,
            html: dispatchedEmail({
              name:        row.name,
              eventTitle:  result.event.title,
              trackingId:  row.trackingId,
              courier:     row.courier,
              trackingUrl: row.trackingUrl,
              profileUrl:  `${SITE_URL}/profile`,
            }),
          });
        } catch (err) {
          console.error(`❌ Dispatch email fail (${row.email}):`, err.message);
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      console.log(`📧 Dispatch emails done: ${emailQueue.length}`);
    });
  } catch (err) {
    console.error("tracking commit error:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
});

/* ═══════════════════════════════════════════════════════════
   PATCH /api/admin/tracking/:id/delivered
   Ek registration ko delivered mark karna
═══════════════════════════════════════════════════════════ */
router.patch("/:id/delivered", protect, async (req, res) => {
  try {
    const now = new Date();
    const reg = await Registration.findByIdAndUpdate(
      req.params.id,
      {
        $set:  { medalStatus: "delivered", deliveredAt: now },
        $push: { statusHistory: { status: "delivered", note: "Delivered", at: now } },
      },
      { new: true }
    );

    if (!reg) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, registration: reg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
