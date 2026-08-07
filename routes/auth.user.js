const express = require("express");
const router  = express.Router();

const User      = require("../models/User");
const Otp       = require("../models/Otp");
const sendEmail = require("../utils/sendEmail");
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

    // ── Window limit: 15 min mein max 5 OTP ──
    const windowStart = new Date(Date.now() - WINDOW_MIN * 60 * 1000);
    const recentCount = await Otp.countDocuments({ email, createdAt: { $gte: windowStart } });
    if (recentCount >= MAX_PER_WINDOW) {
      return res.status(429).json({
        success: false,
        message: `Too many requests. Please try again in ${WINDOW_MIN} minutes.`,
      });
    }

    const code = generateCode();

    await Otp.create({
      email,
      codeHash:  hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60 * 1000),
      ip:        req.headers["x-forwarded-for"] || req.ip || "",
    });

    const sent = await sendEmail({
      to:      email,
      subject: `${code} is your Valley Run login code`,
      html:    otpEmail({ name: user.name, code, ttlMinutes: OTP_TTL_MIN }),
    });

    if (!sent) {
      return res.status(502).json({
        success: false,
        message: "We could not send the email. Please try again shortly.",
      });
    }

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
