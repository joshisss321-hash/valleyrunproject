const Razorpay = require("razorpay");
const crypto = require("crypto");
const Registration = require("../models/Registration");
const Event = require("../models/Event");
const User = require("../models/User");
const Leaderboard = require("../models/Leaderboard");
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

    if (!amount) {
      return res
        .status(400)
        .json({ success: false, message: "Amount missing" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    });

    res.json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ success: false });
  }
};

/* ===============================
   VERIFY PAYMENT + SAVE DATA
================================ */
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,

      // form data
      eventSlug,
      category,
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
    } = req.body;

    /* 🔐 VERIFY SIGNATURE */
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment signature" });
    }

    /* ✅ FIND EVENT */
    const event = await Event.findOne({ slug: eventSlug });
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    /* 👤 CREATE / UPDATE USER */
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
    } else {
      user.name = name;
      user.phone = phone;
      user.address1 = address1;
      user.address2 = address2;
      user.landmark = landmark;
      user.city = city;
      user.state = state;
      user.pincode = pincode;
      user.source = source;
      await user.save();
    }

    /* 🧾 REGISTRATION */
    await Registration.create({
      user: user._id,
      event: event._id,
      category,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      amount: event.price || 349,
      status: "paid",
    });

    /* 🏆 LEADERBOARD ENTRY (FIXED) */
    if (user.name && category) {
      await Leaderboard.create({
        event: event._id,
        name: user.name,
        distance: category,
        time: "Pending",
      });
    }

    /* 📧 EMAIL */
    await sendEmail({
      to: email,
      subject: "🎉 Valley Run – Registration Successful!",
      html: `
        <h2>Hi ${name},</h2>
        <p>Your registration for <strong>${event.title}</strong> is confirmed.</p>

        <p><strong>Next Steps:</strong></p>
        <ul>
          <li>Complete your challenge within the event dates</li>
          <li>Send activity screenshot after completion</li>
        </ul>

        <p>
          📧 Email: valleyrun.official@gmail.com<br/>
          📱 WhatsApp: +91 70601 48183
        </p>

        <p>
          Thank you for giving us your valuable time.<br/>
          <strong>Team Valley Run</strong>
        </p>
      `,
    });

    res.json({
      success: true,
      message: "Registration successful",
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
};
