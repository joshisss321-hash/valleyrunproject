const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    eventSlug: { type: String, default: "" }, // ✅ for easy filtering

    category:  { type: String, required: true },
    paymentId: { type: String, required: true },
    orderId:   { type: String, default: "" },
    status:    { type: String, default: "paid" },
    amount:    { type: Number, default: 0 },

    // ── 🎽 BIB NUMBER ────────────────────────────────────────
    bibNumber: { type: String, default: "" },

    // ── 🎟️ COUPON / REFERRAL ─────────────────────────────────
    couponCode:     { type: String, default: "" },
    discountAmount: { type: Number, default: 0 },

    // Medal dispatch tracking
    medalStatus: {
      type: String,
      enum: ["pending", "verified", "dispatched", "delivered"],
      default: "pending",
    },
    trackingId: { type: String, default: "" },

    // ── 📦 COURIER DETAILS (Amazon-style tracking ke liye) ───
    courier:      { type: String, default: "" }, // "delhivery", "bluedart", ...
    trackingUrl:  { type: String, default: "" },
    dispatchedAt: { type: Date,   default: null },
    deliveredAt:  { type: Date,   default: null },

    // Har status change ka record — profile timeline yahi se banta hai
    statusHistory: {
      type: [
        {
          _id:    false,
          status: { type: String },
          note:   { type: String, default: "" },
          at:     { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// Prevent duplicate registration
registrationSchema.index({ user: 1, event: 1 }, { unique: true });
registrationSchema.index({ eventSlug: 1 });
registrationSchema.index({ bibNumber: 1 });
registrationSchema.index({ medalStatus: 1 });

module.exports = mongoose.model("Registration", registrationSchema);
