const mongoose = require("mongoose");

/**
 * Discount coupon.
 *
 * Teen kism ke coupons:
 *  - "referral_welcome" : jo naya banda kisi ke code se aaya — 5% instant
 *  - "referral_reward"  : referrer ko 3 paid referrals ke baad — 6%
 *  - "manual"           : admin ka banaya hua (EARLYBIRD etc.)
 *
 * `owner` set ho to coupon sirf usi user ka email use kar sakta hai.
 */
const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    kind: {
      type: String,
      enum: ["referral_welcome", "referral_reward", "manual"],
      default: "manual",
    },

    discountType: {
      type: String,
      enum: ["percent", "flat"],
      default: "percent",
    },

    // percent ho to 6 = 6%, flat ho to 50 = ₹50
    value: { type: Number, required: true, min: 0 },

    // percent discount pe max cap (0 = koi cap nahi)
    maxDiscount: { type: Number, default: 0 },

    // Itne amount se upar hi lagega (0 = koi limit nahi)
    minAmount: { type: Number, default: 0 },

    // ── Kaun use kar sakta hai ────────────────────────────
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    ownerEmail: { type: String, default: "", lowercase: true, trim: true },

    // Khaali = sabhi events pe chalega
    eventSlug: { type: String, default: "" },

    // ── Usage limits ──────────────────────────────────────
    maxUses:   { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },

    usedBy: {
      type: [
        {
          _id:      false,
          user:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          email:    { type: String, default: "" },
          orderId:  { type: String, default: "" },
          discount: { type: Number, default: 0 },
          at:       { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    active:    { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },

    note: { type: String, default: "" },
  },
  { timestamps: true }
);

couponSchema.index({ ownerEmail: 1, active: 1 });

/**
 * Coupon abhi use ho sakta hai ya nahi.
 * Amount aur email dono optional — sirf availability check ke liye bhi call kar sakte ho.
 */
couponSchema.methods.checkUsable = function ({ email, amount, eventSlug } = {}) {
  if (!this.active) {
    return { ok: false, message: "Ye coupon ab active nahi hai" };
  }

  if (this.expiresAt && this.expiresAt < new Date()) {
    return { ok: false, message: "Coupon expire ho chuka hai" };
  }

  if (this.usedCount >= this.maxUses) {
    return { ok: false, message: "Coupon ki usage limit khatam ho gayi" };
  }

  if (this.ownerEmail && email && this.ownerEmail !== String(email).toLowerCase()) {
    return { ok: false, message: "Ye coupon aapke account ke liye nahi hai" };
  }

  if (this.eventSlug && eventSlug && this.eventSlug !== eventSlug) {
    return { ok: false, message: "Ye coupon is event pe valid nahi hai" };
  }

  if (amount != null && this.minAmount > 0 && amount < this.minAmount) {
    return { ok: false, message: `Ye coupon ₹${this.minAmount} se upar hi lagta hai` };
  }

  return { ok: true };
};

/** Discount rupees mein — kabhi amount se zyada nahi hoga. */
couponSchema.methods.calcDiscount = function (amount) {
  const base = Number(amount) || 0;
  if (base <= 0) return 0;

  let discount =
    this.discountType === "percent"
      ? Math.round((base * this.value) / 100)
      : Math.round(this.value);

  if (this.maxDiscount > 0) discount = Math.min(discount, this.maxDiscount);

  // Kabhi poora amount free na ho jaye — kam se kam ₹1 charge
  return Math.max(0, Math.min(discount, base - 1));
};

module.exports = mongoose.model("Coupon", couponSchema);
