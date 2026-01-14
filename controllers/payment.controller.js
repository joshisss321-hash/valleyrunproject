// const Razorpay = require("razorpay");
// const crypto = require("crypto");
// const Registration = require("../models/Registration");
// const Event = require("../models/Event");
// const User = require("../models/User");
// const sendEmail = require("../utils/sendEmail");

// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID,
//   key_secret: process.env.RAZORPAY_KEY_SECRET,
// });

// /* ===============================
//    CREATE ORDER
// ================================ */
// const createOrder = async (req, res) => {
//   try {
//     const { amount } = req.body;

//     const order = await razorpay.orders.create({
//       amount: amount * 100,
//       currency: "INR",
//       receipt: `receipt_${Date.now()}`,
//     });

//     res.json({
//       success: true,
//       order,
//       key: process.env.RAZORPAY_KEY_ID,
//     });
//   } catch (err) {
//     res.status(500).json({ success: false });
//   }
// };

// /* ===============================
//    VERIFY PAYMENT
// ================================ */
// const verifyPayment = async (req, res) => {
//   try {
//     const {
//       razorpay_order_id,
//       razorpay_payment_id,
//       razorpay_signature,
//       eventSlug,
//       category,
//       name,
//       email,
//       phone,
//     } = req.body;

//     // 🔐 Signature verify
//     const body = razorpay_order_id + "|" + razorpay_payment_id;
//     const expected = crypto
//       .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//       .update(body)
//       .digest("hex");

//     if (expected !== razorpay_signature) {
//       return res.status(400).json({ success: false });
//     }

//     const event = await Event.findOne({ slug: eventSlug });
//     if (!event) return res.status(404).json({ success: false });

//     let user = await User.findOne({ email });
//     if (!user) {
//       user = await User.create({ name, email, phone });
//     }

//     await Registration.create({
//       user: user._id,
//       event: event._id,
//       category,
//       paymentId: razorpay_payment_id,
//       orderId: razorpay_order_id,
//       status: "paid",
//     });

//     // ✅ IMMEDIATE RESPONSE (NO WAIT)
//     res.json({ success: true });

//     // 🔔 BACKGROUND EMAIL (NON-BLOCKING)
//     sendEmail({
//       to: email,
//       subject: "Valley Run – Registration Confirmed 🏃‍♂️",
//       html: `
//         <h2>Registration Successful 🎉</h2>
//         <p>Hi <b>${name}</b>,</p>
//         <p>You are registered for <b>${event.title}</b></p>
//         <p>Category: ${category}</p>
//         <p>Payment ID: ${razorpay_payment_id}</p>
//         <br/>
//         <p>🏁 Team Valley Run</p>
//       `,
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false });
//   }
// };

// module.exports = { createOrder, verifyPayment };
const Razorpay = require("razorpay");
const crypto = require("crypto");

const Event = require("../models/Event");
const User = require("../models/User");
const Registration = require("../models/Registration");

const sendEmail = require("../services/sendEmail"); // ✅ Brevo API

/* ===============================
   RAZORPAY INSTANCE
================================ */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ===============================
   CREATE ORDER
================================ */
exports.createOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount required",
      });
    }

    const order = await razorpay.orders.create({
      amount: Number(amount) * 100, // paise
      currency: "INR",
      receipt: "valley_run_" + Date.now(),
    });

    return res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("❌ Create order error:", error);
    return res.status(500).json({
      success: false,
      message: "Order creation failed",
    });
  }
};

/* ===============================
   VERIFY PAYMENT
================================ */
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,

      // form data
      name,
      email,
      phone,
      address1,
      address2,
      landmark,
      city,
      state,
      pincode,
      category,
      source,
      eventSlug,
    } = req.body;

    /* 🔴 REQUIRED VALIDATION */
    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !eventSlug
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment data",
      });
    }

    /* 🔐 SIGNATURE VERIFY */
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    /* ===============================
       EVENT (slug = payment key)
    ================================ */
    const event = await Event.findOne({ slug: eventSlug });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    /* ===============================
       USER
    ================================ */
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        phone,
        address1,
        address2,
        landmark,
        city,
        state,
        pincode,
        source,
      });
    }

    /* ===============================
       REGISTRATION
    ================================ */
    await Registration.create({
      user: user._id,
      event: event._id,
      category,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      amount: event.price || 349,
      status: "paid",
    });

    /* ===============================
       SEND EMAIL (ASYNC – NON BLOCKING)
    ================================ */
    sendEmail({
      to: user.email,
      subject: "🎉 Valley Run Registration Successful",
      html: `
        <h2>Payment Successful 🎉</h2>
        <p>Hi <b>${user.name}</b>,</p>
        <p>You are successfully registered for <b>${event.title}</b>.</p>
        <p>🏅 Your premium finisher medal will be delivered to your address.</p>
        <br/>
        <p>Keep running. Keep growing.</p>
        <p><b>– Team Valley Run</b></p>
      `,
    });

    /* ===============================
       FINAL RESPONSE
    ================================ */
    return res.status(200).json({
      success: true,
      message: "Payment verified & registration successful",
    });
  } catch (error) {
    console.error("❌ Verify payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
