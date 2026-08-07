// const mongoose = require("mongoose");

// const userSchema = new mongoose.Schema(
//   {
//     name: {
//       type: String,
//       required: true,
//     },

//     email: {
//       type: String,
//       required: true,
//       unique: true,
//     },

//     phone: {
//       type: String,
//       required: true,
//     },

//     // 🔽 ADDRESS FIELDS (IMPORTANT)
//     address1: String,
//     address2: String,
//     landmark: String,
//     city: String,
//     state: String,
//     pincode: String,

//     source: String,

//     joinedEvents: [
//       {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Event",
//       },
//     ],
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("User", userSchema);
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    // 📍 ADDRESS
    address1: { type: String, trim: true },
    address2: { type: String, trim: true },
    landmark: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },

    source: String,

    // ── 🎁 REFERRAL ──────────────────────────────────────────
    // Har user ka apna code. `sparse` isliye taaki purane users
    // (jinke paas code nahi hai) unique index ko na todein.
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },

    // Kis user ke code se ye register hua
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    referredByCode: { type: String, default: "" },

    // Kitne logon ne iske code se PAID registration kiya
    referralCount: { type: Number, default: 0 },

    // Kitne reward coupons ab tak issue ho chuke (duplicate reward rokne ke liye)
    referralRewardsIssued: { type: Number, default: 0 },

    // ── 🔐 AUTH ──────────────────────────────────────────────
    lastLoginAt: { type: Date, default: null },

    // ── 🤖 AI COACH TIP (cached) ─────────────────────────────
    // signature stats ka fingerprint hai — stats badalne par hi
    // nayi tip generate hoti hai, har profile view pe nahi.
    coachTip: {
      text:        { type: String, default: "" },
      signature:   { type: String, default: "" },
      generatedAt: { type: Date,   default: null },
    },

    // 🔥 UPDATED PART (ULTRA PRO)
    joinedEvents: [
      {
        eventId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Event",
        },
        eventSlug: {
          type: String,
          required: true,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);