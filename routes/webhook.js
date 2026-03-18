const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const Registration = require("../models/Registration");

// ⚡ RAW BODY middleware IMPORTANT
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

      const signature = req.headers["x-razorpay-signature"];

      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(req.body)
        .digest("hex");

      if (signature !== expectedSignature) {
        return res.status(400).send("Invalid signature");
      }

      const event = JSON.parse(req.body.toString());

      // ✅ PAYMENT SUCCESS
      if (event.event === "payment.captured") {
        const payment = event.payload.payment.entity;

        console.log("🔥 Webhook Payment:", payment.id);

        // ⚡ yaha save karna h
        await Registration.create({
          user: payment.notes.userId || null,
          event: payment.notes.eventId || null,
          category: payment.notes.category || "default",
          paymentId: payment.id,
        });

        console.log("✅ Registration saved via webhook");
      }

      res.status(200).json({ success: true });
    } catch (err) {
      console.log("Webhook Error:", err);
      res.status(500).send("Server Error");
    }
  }
);

module.exports = router;