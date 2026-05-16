const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: "" },
    tagline:     { type: String, default: "" },
    dates:       { type: String, default: "" },
    price:       { type: Number, default: 399 },
    originalPrice: { type: Number, default: null }, // for strikethrough offer

    registrationDeadline: { type: Date, default: null },

    // ── Images (exact same field names as your DB) ──────────
    heroImage:      { type: String, default: "" },
    coverImage:     { type: String, default: "" },
    image:          { type: String, default: "" }, // legacy banner field
    medalImage:     { type: String, default: "" }, // medal front
    medalImageBack: { type: String, default: "" }, // medal back

    gallery: { type: [String], default: [] },

    // ── Categories / distances ───────────────────────────────
    categories: {
      type: [String],
      default: ["5km", "10km", "21km"],
    },

    // ── Status toggles ───────────────────────────────────────
    active:             { type: Boolean, default: true },  // visible on site
    isPrevious:         { type: Boolean, default: false }, // past event
    isRegistrationOpen: { type: Boolean, default: true },  // registration open
    isFeatured:         { type: Boolean, default: false }, // featured

    // ── Social proof ─────────────────────────────────────────
    whatsappLink:   { type: String, default: "" },
    offerBadge:     { type: String, default: "" }, // "Early Bird"
    socialProofText:{ type: String, default: "" }, // "200 runners joined"
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);
