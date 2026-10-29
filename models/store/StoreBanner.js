const mongoose = require("mongoose");

/* Homepage ka promotional banner.
   ⚠️ Countdown SIRF tab dikhega jab endsAt sach mein set ho. Nakli
      "offer khatam hone wala hai" kabhi nahi — wo dark pattern hai,
      aur spec bhi yahi kehta hai. isLive() khud tay karta hai ki
      banner abhi dikhna chahiye ya nahi. */
const storeBannerSchema = new mongoose.Schema(
  {
    title:    { type: String, required: true, trim: true },
    subtitle: { type: String, default: "" },

    image:    { type: String, default: "" },
    imageAlt: { type: String, default: "" },
    link:     { type: String, default: "" },
    ctaText:  { type: String, default: "" },

    startsAt: { type: Date, default: null },
    endsAt:   { type: Date, default: null },   // null = countdown nahi dikhega

    // Sirf dikhane ke liye — asli discount coupon se lagta hai
    couponCode: { type: String, default: "", uppercase: true, trim: true },

    productIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: "StoreProduct" }],
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "StoreCategory" }],

    placement: { type: String, enum: ["hero", "strip", "section"], default: "strip" },
    sortOrder: { type: Number, default: 0 },
    active:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

/** Abhi dikhna chahiye? Band hai, abhi shuru nahi hua, ya khatam ho gaya — to nahi. */
storeBannerSchema.methods.isLive = function (now = new Date()) {
  if (!this.active) return false;
  if (this.startsAt && now < this.startsAt) return false;
  if (this.endsAt   && now > this.endsAt)   return false;
  return true;
};

storeBannerSchema.index({ active: 1, placement: 1, sortOrder: 1 });

module.exports = mongoose.model("StoreBanner", storeBannerSchema);
