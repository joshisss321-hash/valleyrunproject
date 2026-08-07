const express = require("express");
const router  = express.Router();

const Event = require("../models/Event");
const { resolveDiscount } = require("../utils/referral");

/* ═══════════════════════════════════════════════════════════
   POST /api/coupon/validate
   Body: { code, eventSlug, email }

   Amount SERVER se aata hai (Event.price) — client jo bheje
   usse koi farak nahi padta. Ye checkout se pehle sirf preview
   hai; asli discount create-order mein dobara compute hota hai.
═══════════════════════════════════════════════════════════ */
router.post("/validate", async (req, res) => {
  try {
    const { code, eventSlug, email } = req.body;

    if (!code || !String(code).trim()) {
      return res.status(400).json({ success: false, message: "Coupon code daaliye" });
    }

    const event = await Event.findOne({ slug: eventSlug });
    if (!event) {
      return res.status(404).json({ success: false, message: "Event nahi mila" });
    }

    const amount = Number(event.price) || 0;

    const result = await resolveDiscount({
      code,
      email,
      amount,
      eventSlug,
    });

    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.json({
      success:        true,
      code:           result.couponCode,
      kind:           result.kind,
      discount:       result.discount,
      originalAmount: amount,
      finalAmount:    amount - result.discount,
      message:        result.message,
    });
  } catch (err) {
    console.error("coupon validate error:", err);
    res.status(500).json({ success: false, message: "Coupon check nahi ho paya" });
  }
});

module.exports = router;
