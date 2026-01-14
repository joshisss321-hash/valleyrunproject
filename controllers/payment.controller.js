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

    // 1️⃣ Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false });
    }

    // 2️⃣ Find event
    const event = await Event.findOne({ slug: eventSlug });
    if (!event) {
      return res.status(404).json({ success: false });
    }

    // 3️⃣ User
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

    // 4️⃣ Registration
    await Registration.create({
      user: user._id,
      event: event._id,
      category,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      status: "paid",
    });

    // 5️⃣ ✅ SEND EMAIL (IMPORTANT: BEFORE res.json)
    console.log("📧 Sending email to:", email);

    await sendEmail({
      to: email,
      subject: "Valley Run – Registration Successful 🏃‍♂️",
      html: `
        <h2>Registration Successful 🎉</h2>
        <p>Hi <b>${name}</b>,</p>
        <p>You are registered for <b>${event.title}</b></p>
        <p><b>Category:</b> ${category}</p>
        <p><b>Payment ID:</b> ${razorpay_payment_id}</p>
        <br/>
        <p>See you at the finish line 🏁</p>
        <b>Team Valley Run</b>
      `,
    });

    console.log("✅ Email sent successfully");

    // 6️⃣ NOW respond to frontend
    res.json({
      success: true,
      message: "Payment verified, email sent",
    });

  } catch (error) {
    console.error("Verify payment error:", error);
    res.status(500).json({ success: false });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
};
