const express  = require("express");
const router   = express.Router();
const crypto   = require("crypto");
const Registration = require("../models/Registration");
const User         = require("../models/User");
const Event        = require("../models/Event");
const sendEmail    = require("../utils/sendEmail");

router.post(
  "/webhook",
  express.raw({ type: "*/*" }),
  (req, res) => {
    res.status(200).json({ received: true });

    setImmediate(async () => {
      try {
        const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers["x-razorpay-signature"];

        if (!secret || !signature) return;

        let rawBody;
        if (Buffer.isBuffer(req.body)) {
          rawBody = req.body;
        } else if (typeof req.body === "string") {
          rawBody = Buffer.from(req.body);
        } else {
          rawBody = Buffer.from(JSON.stringify(req.body));
        }

        const expected = crypto
          .createHmac("sha256", secret)
          .update(rawBody)
          .digest("hex");

        if (signature !== expected) {
          console.log("❌ Signature mismatch");
          return;
        }

        const event = JSON.parse(rawBody.toString());
        if (event.event !== "payment.captured") return;

        const payment = event.payload.payment.entity;
        console.log("🔥 Webhook payment:", payment.id);

        // Duplicate check
        const existing = await Registration.findOne({ paymentId: payment.id });
        if (existing) {
          console.log("⚠️ Already saved");
          return;
        }

        const notes = payment.notes || {};
        console.log("📋 Notes:", JSON.stringify(notes));

        if (!notes.email || !notes.eventSlug) {
          console.log("⚠️ Missing notes");
          return;
        }

        const ev = await Event.findOne({ slug: notes.eventSlug });
        if (!ev) {
          console.log("❌ Event not found:", notes.eventSlug);
          return;
        }

        // ✅ User create/update
        let user = await User.findOne({ email: notes.email.toLowerCase() });

        if (!user) {
          user = await User.create({
            name:     notes.name     || "Runner",
            email:    notes.email.toLowerCase(),
            phone:    notes.phone    || "",
            address1: notes.address1 || "",
            address2: notes.address2 || "",
            landmark: notes.landmark || "",
            city:     notes.city     || "",
            state:    notes.state    || "",
            pincode:  notes.pincode  || "",
            joinedEvents: [{ eventId: ev._id, eventSlug: notes.eventSlug }],
          });
        } else {
          user.name     = notes.name     || user.name;
          user.phone    = notes.phone    || user.phone;
          user.address1 = notes.address1 || user.address1;
          user.address2 = notes.address2 || user.address2;
          user.landmark = notes.landmark || user.landmark;
          user.city     = notes.city     || user.city;
          user.state    = notes.state    || user.state;
          user.pincode  = notes.pincode  || user.pincode;
          if (!user.joinedEvents?.some(e => e.eventSlug === notes.eventSlug)) {
            user.joinedEvents.push({ eventId: ev._id, eventSlug: notes.eventSlug });
          }
          await user.save();
        }

        // ✅ Save registration
        await Registration.create({
          user:        user._id,
          event:       ev._id,
          eventSlug:   notes.eventSlug,
          category:    notes.category  || "General",
          paymentId:   payment.id,
          orderId:     payment.order_id || "",
          amount:      ev.price        || 0,
          status:      "paid",
          medalStatus: "pending",
        });

        console.log(`✅ Webhook saved: ${notes.email} | ${notes.eventSlug}`);

        // ✅ Email bhejo — same as verify-payment
        const name        = notes.name     || "Runner";
        const safeCategory = notes.category || "General";

        sendEmail({
          to:      notes.email,
          subject: `Registration Confirmed – Valley Run ${ev.title}`,
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
                    Thank you for registering for <strong>Valley Run – ${ev.title}</strong>.
                    Your registration is confirmed!
                  </p>
                  <div class="details-box">
                    <h3>Registration Details</h3>
                    <div class="detail-row">
                      <span class="detail-label">Event</span>
                      <span class="detail-value">${ev.title}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Category</span>
                      <span class="detail-value">${safeCategory}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Run Dates</span>
                      <span class="detail-value">${ev.dates || "TBA"}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Payment ID</span>
                      <span class="detail-value">${payment.id}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Status</span>
                      <span class="detail-value" style="color:#16a34a">✅ Confirmed</span>
                    </div>
                  </div>
                  <h3 style="font-size:15px;font-weight:bold;color:#111;margin-bottom:14px">How It Works</h3>
                  <div class="step">
                    <div class="step-num">1</div>
                    <div class="step-text"><strong>Run anywhere</strong> — park, road, treadmill. Complete ${safeCategory}.</div>
                  </div>
                  <div class="step">
                    <div class="step-num">2</div>
                    <div class="step-text"><strong>Screenshot</strong> your GPS app (Strava, Nike Run Club, Garmin, Google Fit).</div>
                  </div>
                  <div class="step">
                    <div class="step-num">3</div>
                    <div class="step-text"><strong>Submit proof</strong> at: <a href="https://valleyrun.in/activity-submission?event=${notes.eventSlug}" style="color:#dc2626">valleyrun.in/activity-submission</a></div>
                  </div>
                  <div class="step">
                    <div class="step-num">4</div>
                    <div class="step-text"><strong>Receive medal</strong> — Free pan-India delivery after verification!</div>
                  </div>
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
        console.error("❌ Webhook Error:", err.message);
      }
    });
  }
);

module.exports = router;