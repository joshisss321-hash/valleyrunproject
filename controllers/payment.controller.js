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

    /* 🔐 Signature verification */
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

    /* ✅ Event check */
    const event = await Event.findOne({ slug: eventSlug });
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    /* 👤 Create / Update user */
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

    /* 🧾 Registration create */
    await Registration.create({
      user: user._id,
      event: event._id,
      category,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      amount: event.price,
      status: "paid",
    });

    /* 📧 Confirmation email */
    await sendEmail({
      to: email,
      subject: "🎉 Valley Run – Registration Successful!",
      html: `
        <h2>Hi ${name},</h2>
        <p>Your registration for <strong>${event.title}</strong> is confirmed.</p>
        <p>Please complete the challenge and send your activity proof via:</p>
        <p>
          📧 valleyrun.official@gmail.com <br/>
          📱 +91 70601 48183
        </p>
        <p>Thank you for choosing Valley Run 🏃‍♂️</p>
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
      message: "Payment verification failed",
    });
  }
};

module.exports = { verifyPayment };
