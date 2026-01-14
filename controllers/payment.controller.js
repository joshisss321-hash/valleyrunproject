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

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount missing",
      });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100, // paise
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
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    /* ✅ EVENT */
    const event = await Event.findOne({ slug: eventSlug });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    /* ✅ USER */
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

    /* ✅ REGISTRATION */
    await Registration.create({
      user: user._id,
      event: event._id,
      category,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      status: "paid",
    });

    /* ✅ SEND EMAIL (NON-BLOCKING SAFE) */
    try {
      await sendEmail({
        to: email,
        subject: "Valley Run – Registration Successful 🏃‍♂️",
        html: `
          <h2>Registration Successful 🎉</h2>
          <p>Hi <b>${name}</b>,</p>
          <p>You have successfully registered for <b>${event.title}</b>.</p>
          <p><b>Category:</b> ${category}</p>
          <p><b>Payment ID:</b> ${razorpay_payment_id}</p>
          <br/>
          <p>See you at the finish line 🏁</p>
          <p>Thank you for giving us your valuable time.</p>
          <p><b>Team Valley Run</b></p>
        `,
      });
    } catch (mailError) {
      console.error("Email sending failed:", mailError.message);
      // ❗ Payment should NOT fail if email fails
    }

    /* ✅ FINAL RESPONSE */
    res.json({
      success: true,
      message: "Payment verified & registration successful",
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
