const Razorpay = require("razorpay");
const crypto = require("crypto");
const Registration = require("../models/Registration");
const Event = require("../models/Event");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail"); // ✅ ADD THIS

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
      return res.status(400).json({
        success: false,
        message: "Amount missing",
      });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100, // ₹ → paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    });

    res.json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      success: false,
      message: "Order creation failed",
    });
  }
};

/* ===============================
   VERIFY PAYMENT + EMAIL
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
      address1,
      address2,
      landmark,
      city,
      state,
      pincode,
      source,
    } = req.body;

    /* 🔐 Verify Razorpay signature */
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    /* ✅ Find event */
    const event = await Event.findOne({ slug: eventSlug });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    /* ✅ Create / Update User */
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

    /* ✅ Save Registration */
    await Registration.create({
      user: user._id,
      event: event._id,
      category,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      status: "paid",
    });

    /* ===============================
       📧 SEND SUCCESS EMAIL
    ================================ */
    await sendEmail({
      to: email,
      subject: "🎉 Valley Run – Registration Successful!",
      html: `
        <h2>Hi ${name},</h2>

        <p>Congratulations! 🎉</p>

        <p>Your registration for <strong>${event.title}</strong> is confirmed.</p>

        <h3>📌 What’s Next?</h3>
        <ul>
          <li>Complete your challenge within the given dates</li>
          <li>Track your activity using Strava / Garmin / Google Fit</li>
          <li>Send your screenshot after completion</li>
        </ul>

        <p>
          📧 Email: <strong>valleyrun.official@gmail.com</strong><br/>
          📱 WhatsApp: <strong>+91 70601 48183</strong>
        </p>

        <p>
          Thank you for giving us your valuable time 💙<br/>
          Stay disciplined & keep moving!
        </p>

        <br/>
        <strong>— Team Valley Run</strong>
      `,
    });

    /* ✅ Final response */
    res.json({
      success: true,
      message: "Payment verified, registration saved & email sent",
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
