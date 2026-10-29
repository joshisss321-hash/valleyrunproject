const mongoose = require("mongoose");

/* Product review.
   ⚠️ Review SIRF us bande ki chalegi jisne wo product sach mein khareeda
      ho — isliye `order` zaroori hai. Nakli review ya banayi hui rating
      kabhi nahi daalni. Shuru mein ye khali rahega, aur product page par
      rating ka hissa tab tak dikhega hi nahi. */
const storeReviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "StoreProduct", required: true },
    user:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    order:   { type: mongoose.Schema.Types.ObjectId, ref: "StoreOrder", required: true },

    name:   { type: String, default: "" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title:  { type: String, default: "" },
    text:   { type: String, default: "" },
    images: [{ type: String }],

    // Admin ke dekhe bina public nahi hoti
    approved: { type: Boolean, default: false },
    adminNote:{ type: String,  default: "" },
  },
  { timestamps: true }
);

// Ek order ke ek product par ek hi review
storeReviewSchema.index({ product: 1, user: 1, order: 1 }, { unique: true });
storeReviewSchema.index({ product: 1, approved: 1, createdAt: -1 });

module.exports = mongoose.model("StoreReview", storeReviewSchema);
