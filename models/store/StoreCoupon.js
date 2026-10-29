const mongoose = require("mongoose");

/* Store ka apna coupon. Valley Run ke Coupon model se alag rakha hai —
   wahan race registration aur referral ka hisaab hai, yahan products,
   categories aur per-customer limit chahiye. Ek hi model mein dono
   thoonsne se dono uljh jaate. */
const storeCouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },

    discountType: { type: String, enum: ["percent", "flat"], default: "percent" },
    value:        { type: Number, required: true, min: 0 },
    maxDiscount:  { type: Number, default: 0 },   // percent par upper limit; 0 = koi limit nahi
    minOrder:     { type: Number, default: 0 },

    startsAt:  { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    totalLimit:       { type: Number, default: 0 },  // 0 = bina limit
    perCustomerLimit: { type: Number, default: 1 },
    usedCount:        { type: Number, default: 0 },

    // Khali = sab par chalega
    productIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: "StoreProduct" }],
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "StoreCategory" }],

    firstOrderOnly: { type: Boolean, default: false },
    active:         { type: Boolean, default: true },

    usedBy: {
      type: [{
        _id:      false,
        user:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        email:    { type: String, default: "" },
        orderNo:  { type: String, default: "" },
        discount: { type: Number, default: 0 },
        at:       { type: Date, default: Date.now },
      }],
      default: [],
    },

    note: { type: String, default: "" },
  },
  { timestamps: true }
);

storeCouponSchema.index({ active: 1, expiresAt: 1 });

module.exports = mongoose.model("StoreCoupon", storeCouponSchema);
