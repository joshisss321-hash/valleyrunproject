const express = require("express");
const router  = require("express").Router();
const crypto  = require("crypto");
const Registration = require("../models/Registration");
const User         = require("../models/User");
const Event        = require("../models/Event");

router.post(
  "/webhook",
  express.raw({ type: "*/*" }),
  (req, res) => {
    res.status(200).json({ received: true });

    setImmediate(async () => {
      try {
        const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers["x-razorpay-signature"];

        if (!secret) {
          console.log("❌ RAZORPAY_WEBHOOK_SECRET not set");
          return;
        }

        if (!signature) {
          console.log("❌ No signature header");
          return;
        }

        // ✅ Raw body
        let rawBody;
        if (Buffer.isBuffer(req.body)) {
          rawBody = req.body;
        } else if (typeof req.body === "string") {
          rawBody = Buffer.from(req.body);
        } else {
          rawBody = Buffer.from(JSON.stringify(req.body));
        }

        const expected = crypto
          .createHmac("sha256", secret)
          .update(rawBody)
          .digest("hex");

        if (signature !== expected) {
          console.log("❌ Signature mismatch");
          return;
        }

        const event = JSON.parse(rawBody.toString());
        if (event.event !== "payment.captured") return;

        const payment = event.payload.payment.entity;
        console.log("🔥 Webhook payment:", payment.id);

        // Duplicate check
        const existing = await Registration.findOne({ paymentId: payment.id });
        if (existing) {
          console.log("⚠️ Already saved by verify-payment");
          return;
        }

        const notes = payment.notes || {};
        console.log("📋 Notes:", JSON.stringify(notes));

        if (!notes.email || !notes.eventSlug) {
          console.log("⚠️ Missing email or eventSlug in notes");
          return;
        }

        const ev = await Event.findOne({ slug: notes.eventSlug });
        if (!ev) {
          console.log("❌ Event not found:", notes.eventSlug);
          return;
        }

        // ✅ User create/update — same format as verify-payment
        let user = await User.findOne({ email: notes.email.toLowerCase() });

        if (!user) {
          user = await User.create({
            name:     notes.name     || "Runner",
            email:    notes.email.toLowerCase(),
            phone:    notes.phone    || "",
            address1: notes.address1 || "",
            address2: notes.address2 || "",
            landmark: notes.landmark || "",
            city:     notes.city     || "",
            state:    notes.state    || "",
            pincode:  notes.pincode  || "",
            joinedEvents: [{ eventId: ev._id, eventSlug: notes.eventSlug }],
          });
          console.log("✅ New user created:", notes.email);
        } else {
          user.name     = notes.name     || user.name;
          user.phone    = notes.phone    || user.phone;
          user.address1 = notes.address1 || user.address1;
          user.address2 = notes.address2 || user.address2;
          user.landmark = notes.landmark || user.landmark;
          user.city     = notes.city     || user.city;
          user.state    = notes.state    || user.state;
          user.pincode  = notes.pincode  || user.pincode;
          if (!user.joinedEvents?.some(e => e.eventSlug === notes.eventSlug)) {
            user.joinedEvents.push({ eventId: ev._id, eventSlug: notes.eventSlug });
          }
          await user.save();
          console.log("✅ Existing user updated:", notes.email);
        }

        // ✅ Save registration
        await Registration.create({
          user:        user._id,
          event:       ev._id,
          eventSlug:   notes.eventSlug,
          category:    notes.category  || "General",
          paymentId:   payment.id,
          orderId:     payment.order_id || "",
          amount:      ev.price        || 0,
          status:      "paid",
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