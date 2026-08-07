const express = require("express");
const router  = express.Router();

const User      = require("../models/User");
const Otp       = require("../models/Otp");
const sendEmail     = require("../utils/sendEmail");
const sendEmailSmtp = require("../utils/sendEmailSmtp");
const otpEmail  = require("../utils/emailTemplates/otpEmail");
const { signUserToken, USER_TOKEN_DAYS } = require("../utils/userToken");
const { protectUser } = require("../middleware/userAuth");
const { ensureReferralCode } = require("../utils/referral");

const {
  generateCode,
  hashCode,
  compareCode,
  isValidEmail,
  OTP_TTL_MIN,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SEC,
  MAX_PER_WINDOW,
  WINDOW_MIN,
} = require("../utils/otp");

/* Frontend ko bhejne layak safe user object (kuch bhi sensitive nahi) */
const publicUser = (u) => ({
  id:           u._id,
  name:         u.name,
  email:        u.email,
  phone:        u.phone,
  city:         u.city     || "",
  state:        u.state    || "",
  address1:     u.address1 || "",
  address2:     u.address2 || "",
  landmark:     u.landmark || "",
  pincode:      u.pincode  || "",
  referralCode: u.referralCode || "",
  joinedAt:     u.createdAt,
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/send-otp
   Body: { email }
═══════════════════════════════════════════════════════════ */
router.post("/send-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address" });
    }

    // Sirf registered runners hi login kar sakte hain
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        code: "NOT_REGISTERED",
        message: "We could not find a registration for this email. Please register for an event first.",
      });
    }

    // ── Cooldown: 60 second se pehle dobara nahi ──
    const lastOtp = await Otp.findOne({ email }).sort({ createdAt: -1 });
    if (lastOtp) {
      const elapsed = (Date.now() - lastOtp.createdAt.getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SEC) {
        return res.status(429).json({
          success: false,
          message: `Please wait ${Math.ceil(RESEND_COOLDOWN_SEC - elapsed)} seconds before requesting another code`,
          retryAfter: Math.ceil(RESEND_COOLDOWN_SEC - elapsed),
        });
      }
    }

    // ── Window limit: 15 min mein max itne OTP ──
    const windowStart = new Date(Date.now() - WINDOW_MIN * 60 * 1000);
    const recent      = await Otp.find({ email, createdAt: { $gte: windowStart } })
      .sort({ createdAt: 1 })
      .select("createdAt")
      .lean();

    if (recent.length >= MAX_PER_WINDOW) {
      // Sabse purana OTP window se bahar hone par hi agla mil sakta hai
      const freeAt     = new Date(recent[0].createdAt.getTime() + WINDOW_MIN * 60 * 1000);
      const waitMin    = Math.max(1, Math.ceil((freeAt - Date.now()) / 60000));

      console.warn(`⛔ OTP rate limit: ${email} — ${recent.length} in ${WINDOW_MIN}min, wait ${waitMin}min`);

      return res.status(429).json({
        success: false,
        code:    "RATE_LIMITED",
        message: `Too many code requests. Please try again in ${waitMin} minute${waitMin === 1 ? "" : "s"}.`,
        retryAfterMin: waitMin,
      });
    }

    const code = generateCode();

    const otpDoc = await Otp.create({
      email,
      codeHash:  hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60 * 1000),
      ip:        req.headers["x-forwarded-for"] || req.ip || "",
    });

    /* OTP ke liye Gmail SMTP PEHLE.
       Brevo OTP emails ko 201 dekar sweekar karta hai par bhejta nahi —
       registration mails wahi key se theek jaati hain. Login email par
       hi tikka hai, isliye pehle SMTP, wo na chale to Brevo. */
    const mail = {
      to:      email,
      /* Bilkul wahi subject jo Brevo par saabit tor par kaam karta tha —
         12:09 wali email is format se Sent → Delivered → Opened → Clicked
         tak gayi thi. English conversion mein ise badla tha, wahi galti thi. */
      subject: `${code} — Valley Run login code`,
      html:    otpEmail({ name: user.name, code, ttlMinutes: OTP_TTL_MIN }),
    };

    /* ⚠️ Render outbound SMTP ports (25/465/587) block karta hai — wahan
       ye hamesha "Connection timeout" deta hai. Isliye SMTP default OFF;
       .env mein USE_SMTP_FOR_OTP=true karne par hi try hota hai (kisi
       aise host par jahan SMTP khula ho). */
    let sent = false;

    if (process.env.USE_SMTP_FOR_OTP === "true") {
      sent = await sendEmailSmtp(mail);
      if (!sent) console.warn(`⚠️  SMTP se nahi gaya, Brevo try kar rahe hain → ${email}`);
    }

    if (!sent) sent = await sendEmail(mail);

    if (!sent) {
      /* Email gaya hi nahi — to is koshish ki saza user ko kyun?
         OTP doc hata do, warna wo 60 second ke cooldown mein phas
         jaata hai bina koi code mile. */
      await Otp.deleteOne({ _id: otpDoc._id }).catch(() => {});

      console.error(
        `❌ OTP email FAILED for ${email} — Brevo ne bhejne se mana kiya. ` +
        `BREVO_API_KEY / daily quota check karein. Cooldown reset kar diya.`
      );

      return res.status(502).json({
        success: false,
        code:    "EMAIL_FAILED",
        message: "We could not send the email. Please try again shortly.",
      });
    }

    console.log(`📧 OTP sent to ${email} (${recent.length + 1}/${MAX_PER_WINDOW} in this ${WINDOW_MIN}min window)`);

    res.json({
      success:      true,
      message:      `Verification code sent to ${email}`,
      expiresInMin: OTP_TTL_MIN,
    });
  } catch (err) {
    console.error("send-otp error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/verify-otp
   Body: { email, code }
═══════════════════════════════════════════════════════════ */
router.post("/verify-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const code  = String(req.body.code  || "").trim();

    if (!isValidEmail(email) || !code) {
      return res.status(400).json({ success: false, message: "Email and verification code are both required" });
    }

    const otp = await Otp.findOne({
      email,
      consumed:  false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "That code has expired or was not found. Please request a new one.",
      });
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Please request a new code.",
      });
    }

    if (!compareCode(code, otp.codeHash)) {
      otp.attempts += 1;
      await otp.save();

      const left = MAX_ATTEMPTS - otp.attempts;
      return res.status(400).json({
        success: false,
        message: left > 0
          ? `Incorrect code. ${left} ${left === 1 ? "attempt" : "attempts"} remaining.`
          : "Incorrect code. Please request a new one.",
      });
    }

    // ✅ Sahi OTP — is email ke saare pending OTP consume kar do
    await Otp.updateMany({ email, consumed: false }, { consumed: true });

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    // Pehli baar login — referral code abhi bana do
    await ensureReferralCode(user);

    user.lastLoginAt = new Date();
    await user.save();

    res.json({
      success:      true,
      message:      `Welcome back, ${user.name?.split(" ")[0] || "Runner"}! 👋`,
      token:        signUserToken(user),
      expiresInDays: USER_TOKEN_DAYS,
      user:         publicUser(user),
    });
  } catch (err) {
    console.error("verify-otp error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/auth/me  — token valid hai ya nahi
═══════════════════════════════════════════════════════════ */
router.get("/me", protectUser, async (req, res) => {
  await ensureReferralCode(req.user);
  res.json({ success: true, user: publicUser(req.user) });
});

/* ═══════════════════════════════════════════════════════════
   PUT /api/auth/me  — address update (medal delivery ke liye)
═══════════════════════════════════════════════════════════ */
router.put("/me", protectUser, async (req, res) => {
  try {
    const allowed = [
      "name", "phone", "address1", "address2",
      "landmark", "city", "state", "pincode",
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        req.user[field] = String(req.body[field]).trim();
      }
    });

    await req.user.save();
    res.json({ success: true, message: "Profile updated", user: publicUser(req.user) });
  } catch (err) {
    console.error("update profile error:", err);
    res.status(500).json({ success: false, message: "Could not update your profile" });
  }
});

module.exports = router;
module.exports.publicUser = publicUser;
