const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const Registration = require("../models/Registration");
const User = require("../models/User");
const Event = require("../models/Event");

router.post(
  "/webhook",
  express.raw({ type: "*/*" }),
  (req, res) => {
    res.status(200).json({ received: true });

    setImmediate(async () => {
      try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers["x-razorpay-signature"];

        // ✅ Buffer fix
        const payload = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body));

        const expectedSignature = crypto
          .createHmac("sha256", secret)
          .update(payload)
          .digest("hex");

        if (signature !== expectedSignature) {
          console.log("❌ Invalid signature");
          return;
        }

        const event = JSON.parse(payload.toString());

        if (event.event !== "payment.captured") return;

        const payment = event.payload.payment.entity;
        console.log("🔥 Payment received:", payment.id);

        const existing = await Registration.findOne({ paymentId: payment.id });
        if (existing) {
          console.log("⚠️ Already saved");
          return;
        }

        const notes = payment.notes || {};

        if (!notes.email || !notes.eventSlug) {
          console.log("⚠️ Missing notes:", notes);
          return;
        }

        const ev = await Event.findOne({ slug: notes.eventSlug });
        if (!ev) {
          console.log("❌ Event not found");
          return;
        }

        let user = await User.findOne({ email: notes.email });
        if (!user) {
          user = await User.create({
            name: notes.name || "Unknown",
            email: notes.email,
            phone: notes.phone || "",
            joinedEvents: [{ eventId: ev._id, eventSlug: notes.eventSlug }],
          });
        }

        await Registration.create({
          user: user._id,
          event: ev._id,
          category: notes.category || "General",
          paymentId: payment.id,
          status: "paid",
        });

        console.log("✅ Registration saved successfully");

      } catch (err) {
        console.error("❌ Webhook Error:", err);
      }
    });
  }
);

module.exports = router;