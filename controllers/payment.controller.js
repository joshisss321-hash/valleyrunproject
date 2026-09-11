const Razorpay = require("razorpay");
const crypto = require("crypto");
const Registration = require("../models/Registration");
const Event = require("../models/Event");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const { resolveDiscount, encodePromo, decodePromo } = require("../utils/referral");
const { completeRegistration } = require("../utils/completeRegistration");
const { safeUrl } = require("../utils/safeUrl");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ===============================
   CREATE ORDER
   ✅ FIX: notes mein poora form data
   Webhook yahan se data uthayega
================================ */
const createOrder = async (req, res) => {
  try {
    const {
      amount, eventSlug,
      name, email, phone,
      address1, address2, landmark,
      city, state, pincode,
      category, source,
      couponCode,
    } = req.body;

    /* 🔒 Price SERVER se aati hai.
       Pehle client ka bheja hua `amount` seedha Razorpay ko jaata tha —
       yaani koi bhi ₹1 ka order bana sakta tha. Ab Event.price hi
       authority hai; client amount sirf tab use hota hai jab event
       na mile (aur us case mein registration waise bhi nahi banti). */
    const event = eventSlug ? await Event.findOne({ slug: eventSlug }) : null;

    /* Deadline ke baad naya order nahi banega.
       Pehle sirf cards "band" dikhte the — jiska register page pehle se
       khula tha, wo deadline ke baad bhi pay kar sakta tha.
       Sirf NAYA order roka jaata hai: jisne deadline se pehle order bana
       liya aur thodi der baad pay kiya, uska verify waise hi chalega
       (paisa kat chuka hai, use rokna galat hoga). */
    if (event) {
      const deadline = event.registrationDeadline ? new Date(event.registrationDeadline) : null;
      const closed =
        event.isRegistrationOpen === false ||
        event.isPrevious === true ||
        (deadline && !isNaN(deadline.getTime()) && Date.now() > deadline.getTime());

      if (closed) {
        return res.status(400).json({
          success: false,
          code:    "REGISTRATION_CLOSED",
          message: "Registration for this event has closed.",
        });
      }
    }

    const serverPrice = Number(event?.price) || 0;
    const clientPrice = Number(amount)       || 0;

    // Event ki price set ho to wahi chalti hai. Agar kisi purane event ka
    // price 0/missing ho to purane behaviour par gir jaate hain (client amount)
    // — warna us event ki registration hi band ho jaati.
    let originalAmount = serverPrice > 0 ? serverPrice : clientPrice;

    if (serverPrice > 0 && clientPrice > 0 && serverPrice !== clientPrice) {
      console.warn(
        `⚠️ Price mismatch for ${eventSlug}: client bheja ₹${clientPrice}, server ₹${serverPrice}. Server wali li gayi.`
      );
    }

    if (!originalAmount || originalAmount < 1) {
      return res.status(400).json({
        success: false,
        message: "Amount missing",
      });
    }

    /* ── Coupon / referral ── */
    let payable       = originalAmount;
    let appliedCoupon = "";
    let discount      = 0;
    let referrerId    = "";

    if (couponCode && String(couponCode).trim()) {
      const result = await resolveDiscount({
        code:   couponCode,
        email,
        amount: originalAmount,
        eventSlug,
      });

      if (!result.ok) {
        return res.status(400).json({ success: false, message: result.message });
      }

      discount      = result.discount;
      appliedCoupon = result.couponCode;
      referrerId    = result.referrerId ? String(result.referrerId) : "";
      payable       = originalAmount - discount;
    }

    const order = await razorpay.orders.create({
      // Razorpay poore paise (integer) maangta hai
      amount:   Math.round(payable * 100),
      currency: "INR",
      receipt:  `receipt_${Date.now()}`,
      // ✅ NOTES — webhook yahan se data uthayega agar user back press kare.
      //    Razorpay max 15 notes deta hai, isliye coupon ki teeno cheezein
      //    `promo` mein pack ki hui hain.
      notes: {
        eventSlug: eventSlug || "",
        name:      name      || "",
        email:     email     || "",
        phone:     phone     || "",
        address1:  address1  || "",
        address2:  address2  || "",
        landmark:  landmark  || "",
        city:      city      || "",
        state:     state     || "",
        pincode:   pincode   || "",
        category:  category  || "General",
        source:    source    || "",
        promo:     encodePromo({ couponCode: appliedCoupon, discount, referrerId }),
      },
    });

    return res.json({
      success: true,
      order,
      originalAmount,
      discount,
      payable,
      couponApplied: appliedCoupon,
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

    const safeCategory = category || "General";

    // Find event
    const event = await Event.findOne({ slug: eventSlug });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Create or update user
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name, email, phone,
        address1, address2, landmark,
        city, state, pincode, source,
        joinedEvents: [{ eventId: event._id, eventSlug }],
      });
    } else {
      user.name     = name;
      user.phone    = phone;
      user.address1 = address1;
      user.address2 = address2;
      user.landmark = landmark;
      user.city     = city;
      user.state    = state;
      user.pincode  = pincode;
      user.source   = source;

      if (!user.joinedEvents.some((e) => e.eventSlug === eventSlug)) {
        user.joinedEvents.push({ eventId: event._id, eventSlug });
      }
      await user.save();
    }

    /* ── Coupon / referral info Razorpay order ke notes se ──
       Client par bharosa nahi — jo order banate waqt tay hua tha
       wahi authority hai (webhook bhi yahi padhta hai). */
    let promo = { couponCode: "", discountAmount: 0, referrerId: null };

    // ⚡ Coupon lagaya hi nahi to Razorpay ko call karne ki zaroorat nahi —
    //    zyadatar payments bina extra network hop ke nikal jaate hain.
    if (req.body.couponCode && String(req.body.couponCode).trim()) {
      try {
        const rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
        promo = decodePromo(rzpOrder?.notes?.promo);
      } catch (err) {
        console.error("⚠️ Order notes fetch fail:", err.message);

        // Fallback: client ka bheja code server-side dobara resolve karo
        const result = await resolveDiscount({
          code:   req.body.couponCode,
          email,
          amount: Number(event.price) || 0,
          eventSlug,
        });
        if (result.ok) {
          promo = {
            couponCode:     result.couponCode,
            discountAmount: result.discount,
            referrerId:     result.referrerId || null,
          };
        }
      }
    }

    const amountPaid = Math.max(0, (Number(event.price) || 0) - promo.discountAmount);

    const { registration } = await completeRegistration({
      user,
      event,
      paymentId:      razorpay_payment_id,
      orderId:        razorpay_order_id,
      category:       safeCategory,
      amountPaid,
      couponCode:     promo.couponCode,
      discountAmount: promo.discountAmount,
      referrerId:     promo.referrerId,
    });

    // ✅ Response turant bhejo
    res.json({
      success:   true,
      message:   "Payment verified successfully",
      bibNumber: registration?.bibNumber || "",
    });

    /* Is event ka WhatsApp group — admin ne bhara ho tabhi email mein
       button aayega. Link saaf karke, taaki toota/gandaa link na jaye. */
    const groupLink = safeUrl(event.whatsappLink);

    // ✅ Email background mein
    sendEmail({
      to:      email,
      subject: `Registration Confirmed – Valley Run ${event.title}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}
            .container{max-width:600px;margin:30px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)}
            .header{background:linear-gradient(135deg,#dc2626,#b91c1c);padding:32px;text-align:center}
            .header h1{color:white;margin:0;font-size:24px}
            .header p{color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px}
            .body{padding:32px}
            .greeting{font-size:17px;font-weight:bold;color:#111;margin-bottom:12px}
            .message{color:#555;line-height:1.7;font-size:14px;margin-bottom:24px}
            .details-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:24px}
            .details-box h3{font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px}
            .detail-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
            .detail-row:last-child{border-bottom:none}
            .detail-label{color:#888}
            .detail-value{color:#111;font-weight:600;text-align:right}
            .steps h3{font-size:15px;font-weight:bold;color:#111;margin-bottom:14px}
            .step{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px}
            .step-num{background:#dc2626;color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;flex-shrink:0;margin-top:2px}
            .step-text{color:#555;font-size:14px;line-height:1.6}
            .step-text strong{color:#111}
            .footer{background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb}
            .footer p{color:#888;font-size:12px;margin:4px 0}
            .footer a{color:#dc2626;text-decoration:none}
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
                Thank you for registering for <strong>Valley Run – ${event.title}</strong>.
                Your registration is confirmed. Here are your details:
              </p>
              <div class="details-box">
                <h3>Registration Details</h3>
                <div class="detail-row">
                  <span class="detail-label">Event</span>
                  <span class="detail-value">${event.title}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Category</span>
                  <span class="detail-value">${safeCategory}</span>
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
                  <span class="detail-value" style="color:#16a34a">✅ Confirmed</span>
                </div>
              </div>
              <div class="steps">
                <h3>How It Works</h3>
                <div class="step">
                  <div class="step-num">1</div>
                  <div class="step-text"><strong>Run anywhere</strong> — park, road, treadmill. Complete ${safeCategory}.</div>
                </div>
                <div class="step">
                  <div class="step-num">2</div>
                  <div class="step-text"><strong>Screenshot</strong> your GPS app (Strava, Nike Run Club, Garmin, Google Fit).</div>
                </div>
                   /* <div class="step">
                      <div class="step-num">3</div>
                      <div class="step-text"><strong>Submit proof    
      📩 Once you complete your distance, go back to the event page where you registered.  <a href="https://valleyrun.in" style="color:#dc2626">valleyrun.in</a>.After registration closes, a "Submit Activity" button will appear there.Click it, enter your registered mobile number to find your registration, and submit your activity screenshot.</div>
                    </div> */
                <div class="step">
                  <div class="step-num">4</div>
                  <div class="step-text"><strong>Receive medal</strong> — Free pan-India delivery after verification!</div>
                </div>
              </div>
              ${groupLink ? `
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin:24px 0;text-align:center">
                <p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#166534">
                  Join the ${event.title} WhatsApp group
                </p>
                <p style="margin:0 0 14px;font-size:13px;color:#15803d;line-height:1.5">
                  Event updates, reminders and help — all in one place with the other runners.
                </p>
                <a href="${groupLink}"
                   style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;
                          padding:12px 28px;border-radius:999px;font-weight:bold;font-size:14px">
                  Join Group
                </a>
              </div>` : ""}

              <p class="message">
                We are excited to have you in the Valley Run community! 💪<br><br>
                <strong>Best regards,<br>Team Valley Run</strong>
              </p>
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
    }).catch(err => console.error("❌ Email failed:", err.message));

  } catch (err) {
    console.error("Verify Payment Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = { createOrder, verifyPayment };