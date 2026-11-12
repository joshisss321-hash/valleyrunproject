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

    /* ── 📣 MARKETING ATTRIBUTION ─────────────────────────────
       Ye banda kahan se aaya tha. Sab kuch optional hai aur poora
       block gayab ho sakta hai — purani registrations mein hai hi
       nahi, aur unhe iski zaroorat bhi nahi.

       ⚠️ Ye register form waale "How did you find us?" (User.source)
       se ALAG hai. Wo user ki yaad hai, ye maap hai. Dono ko kabhi
       mila kar mat ginna — jab dono alag kehte hain, wahi sabse
       kaam ki baat hoti hai.

       Khali rehna bilkul theek hai: cookie band thi, ya link bina
       kisi campaign ke khula tha. Khali ka matlab "pata nahi",
       "Direct" nahi.                                                */
    attribution: {
      influencer: { type: mongoose.Schema.Types.ObjectId, ref: "Influencer", default: null },
      code:       { type: String, default: "" },

      source:   { type: String, default: "" },
      medium:   { type: String, default: "" },
      campaign: { type: String, default: "" },
      content:  { type: String, default: "" },
      term:     { type: String, default: "" },

      firstTouchSource:   { type: String, default: "" },
      firstTouchMedium:   { type: String, default: "" },
      firstTouchCampaign: { type: String, default: "" },
      lastTouchSource:    { type: String, default: "" },
      lastTouchMedium:    { type: String, default: "" },
      lastTouchCampaign:  { type: String, default: "" },

      /* Jo sach mein charge hua. Upar wala `amount` raw event.price
         se banta hai, isliye early-bird ke baad wo kam dikhata hai.
         Revenue ke liye yahi sahi number hai. */
      paidAmount: { type: Number, default: 0 },

      at: { type: Date, default: null },
    },

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

/* Marketing dashboard ke liye — influencer ka hisaab aur source-wise
   ginti dono inhi par chalte hain. Sparse nahi rakha kyunki Mongo
   nested path par null bhi index karta hai aur hum "jinki attribution
   nahi hai" bhi ginte hain. */
registrationSchema.index({ "attribution.influencer": 1, createdAt: -1 });
registrationSchema.index({ "attribution.source": 1, createdAt: -1 });

module.exports = mongoose.model("Registration", registrationSchema);
