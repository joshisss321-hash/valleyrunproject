
// const Razorpay = require("razorpay");
// const crypto = require("crypto");
// const Registration = require("../models/Registration");
// const Event = require("../models/Event");
// const User = require("../models/User");

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

//     if (!amount) {
//       return res.status(400).json({
//         success: false,
//         message: "Amount missing",
//       });
//     }

//     const order = await razorpay.orders.create({
//       amount: amount * 100, // convert to paise
//       currency: "INR",
//       receipt: `receipt_${Date.now()}`,
//     });

//     return res.json({
//       success: true,
//       order,
//     });
//   } catch (err) {
//     console.error("Create Order Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Order creation failed",
//     });
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
//       name,
//       email,
//       phone,
//       address1,
//       address2,
//       landmark,
//       city,
//       state,
//       pincode,
//       category,
//       source,
//     } = req.body;

//     // 🔐 Signature verify
//     const body = razorpay_order_id + "|" + razorpay_payment_id;

//     const expectedSignature = crypto
//       .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//       .update(body)
//       .digest("hex");

//     if (expectedSignature !== razorpay_signature) {
//       return res.status(400).json({
//         success: false,
//         message: "Signature mismatch",
//       });
//     }

//     // ✅ Find event
//     const event = await Event.findOne({ slug: eventSlug });
//     if (!event) {
//       return res.status(404).json({
//         success: false,
//         message: "Event not found",
//       });
//     }

//     // ✅ Create or update user
//     let user = await User.findOne({ email });

//     if (!user) {
//       user = await User.create({
//         name,
//         email,
//         phone,
//         address1,
//         address2,
//         landmark,
//         city,
//         state,
//         pincode,
//         source,
//         joinedEvents: [event._id], // 🔥 FIX ADDED HERE
//       });
//     } else {
//       user.name = name;
//       user.phone = phone;
//       user.address1 = address1;
//       user.address2 = address2;
//       user.landmark = landmark;
//       user.city = city;
//       user.state = state;
//       user.pincode = pincode;
//       user.source = source;

//       // 🔥 IMPORTANT FIX
//       // Avoid duplicate entries
//       if (!user.joinedEvents.includes(event._id)) {
//         user.joinedEvents.push(event._id);
//       }

//       await user.save();
//     }

//     // ✅ Save registration
//     await Registration.create({
//       user: user._id,
//       event: event._id,
//       category,
//       paymentId: razorpay_payment_id,
//       orderId: razorpay_order_id,
//       status: "paid",
//     });

//     return res.json({
//       success: true,
//       message: "Payment verified successfully",
//     });

//   } catch (err) {
//     console.error("Verify Payment Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Server error",
//     });
//   }
// };

// module.exports = {
//   createOrder,
//   verifyPayment,
// };

const Razorpay = require("razorpay");
const crypto = require("crypto");
const Registration = require("../models/Registration");
const Event = require("../models/Event");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail"); // ✅ correct path

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
      amount: amount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    });

    return res.json({
      success: true,
      order,
    });
  } catch (err) {
    console.error("Create Order Error:", err);
    return res.status(500).json({
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
    } = req.body;

    // 🔐 Signature verify
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Signature mismatch",
      });
    }

    // ✅ Find event
    const event = await Event.findOne({ slug: eventSlug });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // ✅ Create or update user
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
        joinedEvents: [event._id],
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

      if (!user.joinedEvents.includes(event._id)) {
        user.joinedEvents.push(event._id);
      }

      await user.save();
    }

    // ✅ Save registration
    await Registration.create({
      user: user._id,
      event: event._id,
      category,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      status: "paid",
    });

    // ✅ Response turant bhejo — user wait na kare
    res.json({
      success: true,
      message: "Payment verified successfully",
    });

    // ✅ Email background mein — non-blocking
    // Agar email fail bhi ho toh registration safe rahegi
    sendEmail({
      to: email,
      subject: `Your Registration is Confirmed – Valley Run ${event.title}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
            .header { background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 32px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 24px; }
            .header p { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px; }
            .body { padding: 32px; }
            .greeting { font-size: 17px; font-weight: bold; color: #111; margin-bottom: 12px; }
            .message { color: #555; line-height: 1.7; font-size: 14px; margin-bottom: 24px; }
            .details-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
            .details-box h3 { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 14px; }
            .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
            .detail-row:last-child { border-bottom: none; }
            .detail-label { color: #888; }
            .detail-value { color: #111; font-weight: 600; text-align: right; }
            .steps h3 { font-size: 15px; font-weight: bold; color: #111; margin-bottom: 14px; }
            .step { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
            .step-num { background: #dc2626; color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; margin-top: 2px; }
            .step-text { color: #555; font-size: 14px; line-height: 1.6; }
            .step-text strong { color: #111; }
            .footer { background: #f9fafb; padding: 20px 32px; text-align: center; border-top: 1px solid #e5e7eb; }
            .footer p { color: #888; font-size: 12px; margin: 4px 0; }
            .footer a { color: #dc2626; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">

            <div class="header">
              <h1>🏅 Registration Confirmed!</h1>
              <p>You are officially in. Now go train!</p>
            </div>

            <div class="body">
              <div class="greeting">Hello ${name},</div>
              <p class="message">
                Thank you for registering for the <strong>Valley Run – ${event.title}</strong>.
                Your registration has been successfully confirmed.
                Below are the important event details:
              </p>

              <div class="details-box">
                <h3>Registration Details</h3>
                <div class="detail-row">
                  <span class="detail-label">Event</span>
                  <span class="detail-value">${event.title}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Category</span>
                  <span class="detail-value">${category}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Run Dates</span>
                  <span class="detail-value">${event.dates}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Payment ID</span>
                  <span class="detail-value">${razorpay_payment_id}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Status</span>
                  <span class="detail-value" style="color:#16a34a;">✅ Confirmed</span>
                </div>
              </div>

              <div class="steps">
                <h3>How the Event Works</h3>
                <div class="step">
                  <div class="step-num">1</div>
                  <div class="step-text"><strong>Run from any location</strong> — park, road, treadmill, or track. Complete your chosen distance of ${category}.</div>
                </div>
                <div class="step">
                  <div class="step-num">2</div>
                  <div class="step-text"><strong>Take a screenshot</strong> of your run proof from any running app (Strava, Nike Run Club, Google Fit, etc.) showing date and distance.</div>
                </div>
                <div class="step">
                  <div class="step-num">3</div>
                  <div class="step-text"><strong>Submit your proof</strong> using the link that will be shared after registration closes.</div>
                </div>
                <div class="step">
                  <div class="step-num">4</div>
                  <div class="step-text"><strong>Receive your medal</strong> — After proof is verified, your finisher medal will be delivered to your home. Free pan-India delivery!</div>
                </div>
              </div>

              <p class="message">
                Once registrations close, we will send all participants a run proof submission link
                and share updates on our WhatsApp Channel.<br><br>
                Please make sure to complete your run between the event dates.<br><br>
                We are excited to have you as part of the Valley Run community! 💪
              </p>

              <p class="message">
                If you have any questions, feel free to reply to this email.
              </p>

              <p class="message"><strong>Best regards,<br>Team Valley Run</strong></p>
            </div>

            <div class="footer">
              <p><strong>Valley Run Official</strong></p>
              <p><a href="https://valleyrun.in">www.valleyrun.in</a></p>
              <p>📞 8171794766 | 7060148183</p>
              <p><a href="mailto:valleyrun.official@gmail.com">valleyrun.official@gmail.com</a></p>
            </div>

          </div>
        </body>
        </html>
      `,
    }).catch((emailErr) => {
      // Email fail hone pe bhi registration safe hai
      console.error("❌ Email failed:", emailErr.message);
    });

  } catch (err) {
    console.error("Verify Payment Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
};
