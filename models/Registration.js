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

    // Medal dispatch tracking
    medalStatus: {
      type: String,
      enum: ["pending", "verified", "dispatched", "delivered"],
      default: "pending",
    },
    trackingId: { type: String, default: "" },
  },
  { timestamps: true }
);

// Prevent duplicate registration
registrationSchema.index({ user: 1, event: 1 }, { unique: true });
registrationSchema.index({ eventSlug: 1 });

module.exports = mongoose.model("Registration", registrationSchema);
