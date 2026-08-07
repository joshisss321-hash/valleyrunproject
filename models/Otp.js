const mongoose = require("mongoose");

/**
 * Email OTP for user login.
 * Code kabhi plain text mein store nahi hota — sirf SHA-256 hash.
 * Expired docs Mongo khud TTL index se delete kar deta hai.
 */
const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    codeHash: { type: String, required: true },

    expiresAt: { type: Date, required: true },

    // Galat OTP daalne ki koshishein — 5 ke baad block
    attempts: { type: Number, default: 0 },

    // Ek OTP sirf ek baar use ho sakta hai
    consumed: { type: Boolean, default: false },

    ip: { type: String, default: "" },
  },
  { timestamps: true }
);

otpSchema.index({ email: 1, createdAt: -1 });

// TTL — expiresAt nikalte hi Mongo doc hata deta hai
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", otpSchema);
