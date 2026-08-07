const crypto = require("crypto");

const OTP_LENGTH   = 6;
const OTP_TTL_MIN  = 10;  // OTP kitni der valid rahega
const MAX_ATTEMPTS = 5;   // itni galat koshishon ke baad OTP dead
const RESEND_COOLDOWN_SEC = 60;  // do OTP ke beech minimum gap
const MAX_PER_WINDOW      = 10;  // 15 min mein max itne OTP (testing ke liye 5 kam pad raha tha)
const WINDOW_MIN          = 15;

/** 6-digit code, cryptographically random (Math.random se nahi). */
const generateCode = () =>
  String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");

/** Code kabhi plain store nahi hota — sirf ye hash DB mein jaata hai. */
const hashCode = (code) =>
  crypto.createHash("sha256").update(String(code).trim()).digest("hex");

/** Timing-safe comparison — hash lambai same hai isliye safe hai. */
const compareCode = (code, storedHash) => {
  const a = Buffer.from(hashCode(code));
  const b = Buffer.from(String(storedHash || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const isValidEmail = (email) =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

module.exports = {
  generateCode,
  hashCode,
  compareCode,
  isValidEmail,
  OTP_TTL_MIN,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SEC,
  MAX_PER_WINDOW,
  WINDOW_MIN,
};
