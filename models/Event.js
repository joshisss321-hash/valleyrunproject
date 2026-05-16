const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title:       { type: String },
    slug:        { type: String, unique: true },
    description: { type: String, default: "" },
    dates:       { type: String, default: "" },
    price:       { type: Number, default: 349 },

    // ── Dates ───────────────────────────────────────────────
    registrationDeadline: { type: Date, default: null }, // registration band hone ki date
    submissionDeadline:   { type: Date, default: null }, // activity submit karne ki last date (event end)

    // ── Images ──────────────────────────────────────────────
    heroImage:      { type: String, default: "" },
    coverImage:     { type: String, default: "" },
    medalImage:     { type: String, default: "" },
    medalImageBack: { type: String, default: "" },
    image:          { type: String, default: "" },

    gallery: { type: [String], default: [] },

    // ── Categories ──────────────────────────────────────────
    categories: { type: [String], default: ["5km", "10km", "21km"] },

    // ── Status flags ────────────────────────────────────────
    active:             { type: Boolean, default: true },
    isPrevious:         { type: Boolean, default: false },
    isRegistrationOpen: { type: Boolean, default: true },
    isFeatured:         { type: Boolean, default: false },

    // ── Extra ────────────────────────────────────────────────
    whatsappLink:    { type: String, default: "" },
    offerBadge:      { type: String, default: "" },
    socialProofText: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);
