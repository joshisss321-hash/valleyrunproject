const mongoose = require("mongoose");

/* Stock kab-kab aur kyun hila — ka poora hisaab.
   Bina iske "stock 3 kam kyun hai" ka jawab kabhi nahi milta: order gaya,
   admin ne badla, ya return aaya — teeno ek jaise dikhte hain. */
const storeStockLogSchema = new mongoose.Schema(
  {
    product:   { type: mongoose.Schema.Types.ObjectId, ref: "StoreProduct", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },

    delta:  { type: Number, required: true },   // -2 bika, +10 naya maal aaya
    before: { type: Number, default: 0 },
    after:  { type: Number, default: 0 },

    reason: {
      type: String,
      enum: ["order", "cancel", "return", "admin_edit", "restock", "correction"],
      required: true,
    },

    order: { type: mongoose.Schema.Types.ObjectId, ref: "StoreOrder", default: null },
    by:    { type: String, default: "system" },   // "system" | admin ki email
    note:  { type: String, default: "" },
  },
  { timestamps: true }
);

storeStockLogSchema.index({ product: 1, createdAt: -1 });
storeStockLogSchema.index({ order: 1 });

module.exports = mongoose.model("StoreStockLog", storeStockLogSchema);
