const Razorpay = require("razorpay");
const crypto = require("crypto");
const Registration = require("../models/Registration");
const Event = require("../models/Event");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ===============================
   CREATE ORDER
================================ */
const createOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    });

    res.json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

/* ===============================
   VERIFY PAYMENT
================================ */
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      eventSlug,
      category,
      name,
      email,
      phone,
    } = req.body;

    // 🔐 Signature verify
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false });
    }

    const event = await Event.findOne({ slug: eventSlug });
    if (!event) return res.status(404).json({ success: false });

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ name, email, phone });
    }

    await Registration.create({
      user: user._id,
      event: event._id,
      category,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      status: "paid",
    });

    // ✅ IMMEDIATE RESPONSE (NO WAIT)
    res.json({ success: true });

    // 🔔 BACKGROUND EMAIL (NON-BLOCKING)
    sendEmail({
      to: email,
      subject: "Valley Run – Registration Confirmed 🏃‍♂️",
      html: `
        <h2>Registration Successful 🎉</h2>
        <p>Hi <b>${name}</b>,</p>
        <p>You are registered for <b>${event.title}</b></p>
        <p>Category: ${category}</p>
        <p>Payment ID: ${razorpay_payment_id}</p>
        <br/>
        <p>🏁 Team Valley Run</p>
      `,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

module.exports = { createOrder, verifyPayment };
