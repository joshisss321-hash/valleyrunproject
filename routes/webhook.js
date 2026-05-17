const express = require("express");
const router  = express.Router();
const crypto  = require("crypto");
const Registration = require("../models/Registration");
const User         = require("../models/User");
const Event        = require("../models/Event");

router.post(
  "/webhook",
  express.raw({ type: "*/*" }),
  (req, res) => {
    // ✅ Turant 200 bhejo — Razorpay 5 sec timeout karta hai
    res.status(200).json({ received: true });

    setImmediate(async () => {
      try {
        const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers["x-razorpay-signature"];

        if (!secret || !signature) {
          console.log("❌ Webhook: missing secret or signature");
          return;
        }

        const payload = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body));

        const expected = crypto
          .createHmac("sha256", secret)
          .update(payload)
          .digest("hex");

        if (signature !== expected) {
          console.log("❌ Webhook: Invalid signature");
          return;
        }

        const event = JSON.parse(payload.toString());

        if (event.event !== "payment.captured") return;

        const payment = event.payload.payment.entity;
        console.log("🔥 Webhook payment:", payment.id);

        // ✅ Duplicate check — agar verify-payment ne already save kiya
        const existing = await Registration.findOne({ paymentId: payment.id });
        if (existing) {
          console.log("⚠️ Already saved by verify-payment — skip");
          return;
        }

        // ✅ Notes se data lo
        const notes = payment.notes || {};
        console.log("📋 Notes:", JSON.stringify(notes));

        if (!notes.email || !notes.eventSlug) {
          console.log("⚠️ Missing email or eventSlug in notes — cannot save");
          return;
        }

        const ev = await Event.findOne({ slug: notes.eventSlug });
        if (!ev) {
          console.log("❌ Event not found:", notes.eventSlug);
          return;
        }

        // ✅ Upsert user with full address
        let user = await User.findOneAndUpdate(
          { email: notes.email.toLowerCase() },
          {
            name:     notes.name     || "Runner",
            phone:    notes.phone    || "",
            address1: notes.address1 || "",
            address2: notes.address2 || "",
            landmark: notes.landmark || "",
            city:     notes.city     || "",
            state:    notes.state    || "",
            pincode:  notes.pincode  || "",
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // ✅ Save registration
        await Registration.create({
          user:      user._id,
          event:     ev._id,
          eventSlug: notes.eventSlug,
          category:  notes.category  || "General",
          paymentId: payment.id,
          orderId:   payment.order_id || "",
          amount:    ev.price        || 0,
          status:    "paid",
          medalStatus: "pending",
        });

        console.log(`✅ Webhook saved: ${notes.email} | ${notes.eventSlug} | ${notes.category}`);

      } catch (err) {
        console.error("❌ Webhook Error:", err.message);
      }
    });
  }
);

module.exports = router;