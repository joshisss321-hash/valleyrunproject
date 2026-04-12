// const express = require("express");
// const router = express.Router();
// const crypto = require("crypto");
// const Registration = require("../models/Registration");
// const User = require("../models/User");
// const Event = require("../models/Event");

// router.post(
//   "/webhook",
//   express.raw({ type: "application/json" }),
//   async (req, res) => {
//     try {
//       const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
//       const signature = req.headers["x-razorpay-signature"];

//       const expectedSignature = crypto
//         .createHmac("sha256", secret)
//         .update(req.body)
//         .digest("hex");

//       if (signature !== expectedSignature) {
//         return res.status(400).send("Invalid signature");
//       }

//       const event = JSON.parse(req.body.toString());

//       if (event.event === "payment.captured") {
//         const payment = event.payload.payment.entity;
//         console.log("🔥 Webhook Payment:", payment.id);

//         // Already saved by verifyPayment?
//         const existing = await Registration.findOne({ paymentId: payment.id });
//         if (existing) {
//           console.log("✅ Already registered");
//           return res.status(200).json({ success: true });
//         }

//         // Fallback save
//         const notes = payment.notes || {};
//         if (notes.eventSlug && notes.email) {
//           const ev = await Event.findOne({ slug: notes.eventSlug });
//           let user = await User.findOne({ email: notes.email });

//           if (!user) {
//             user = await User.create({
//               name: notes.name || "Unknown",
//               email: notes.email,
//               phone: notes.phone || "",
//               joinedEvents: ev ? [{ eventId: ev._id, eventSlug: notes.eventSlug }] : [],
//             });
//           }

//           if (user && ev) {
//             await Registration.create({
//               user: user._id,
//               event: ev._id,
//               category: notes.category || "General",
//               paymentId: payment.id,
//               status: "paid",
//             });
//             console.log("✅ Registration saved via webhook fallback");
//           }
//         } else {
//           console.log("⚠️ Notes missing:", notes);
//         }
//       }

//       res.status(200).json({ success: true });
//     } catch (err) {
//       console.error("Webhook Error:", err.message);
//       res.status(500).send("Server Error");
//     }
//   }
// );

// module.exports = router;
const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const Registration = require("../models/Registration");
const User = require("../models/User");
const Event = require("../models/Event");

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {

    // ✅ STEP 1: INSTANT RESPONSE (MOST IMPORTANT 🔥)
    res.status(200).json({ received: true });

    // ✅ STEP 2: BACKGROUND PROCESSING
    setImmediate(async () => {
      try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers["x-razorpay-signature"];

        // 🔐 Signature verify
        const expectedSignature = crypto
          .createHmac("sha256", secret)
          .update(req.body)
          .digest("hex");

        if (signature !== expectedSignature) {
          console.log("❌ Invalid signature");
          return;
        }

        const event = JSON.parse(req.body.toString());

        // 🎯 Only handle payment success
        if (event.event !== "payment.captured") return;

        const payment = event.payload.payment.entity;

        console.log("🔥 Payment received:", payment.id);

        // ✅ Duplicate check
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

        // 🔎 Find event
        const ev = await Event.findOne({ slug: notes.eventSlug });
        if (!ev) {
          console.log("❌ Event not found");
          return;
        }

        // 👤 Find or create user
        let user = await User.findOne({ email: notes.email });

        if (!user) {
          user = await User.create({
            name: notes.name || "Unknown",
            email: notes.email,
            phone: notes.phone || "",
            joinedEvents: [
              { eventId: ev._id, eventSlug: notes.eventSlug },
            ],
          });
        }

        // 📝 Save registration
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