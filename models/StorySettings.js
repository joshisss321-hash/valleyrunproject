const mongoose = require("mongoose");

/* Homepage ke stories section ki settings — ek hi document.
   Heading aur consent ka text yahan isliye hai taaki admin bina deploy
   ke badal sake. Consent ka text badalna khaas kaam ka hai: jo text
   participant ne dekha tha wahi uski kahani ke saath save hota hai. */
const storySettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "stories", unique: true },

    sectionEnabled: { type: Boolean, default: false },  // default BAND
    heading: { type: String, default: "This Week's Inspiring Journey" },
    tagline: { type: String, default: "One story. One journey. Endless inspiration." },

    /* Koi kahani chuni hi nahi — tab kya karein.
       "hide" = section gayab, "fallback" = ek line dikha do. */
    whenEmpty:    { type: String, enum: ["hide", "fallback"], default: "hide" },
    fallbackText: { type: String, default: "New stories coming soon." },

    submissionsOpen: { type: Boolean, default: true },
    submitIntro: {
      type: String,
      default: "Finished a challenge? Tell us what it took. We publish one story at a time.",
    },

    /* Wahi text jo submit form par dikhega aur har kahani ke saath
       save hoga. Badalne par purani kahaniyon ka record nahi badalta —
       unke paas apna, us waqt ka text rehta hai. */
    consentText: {
      type: String,
      default:
        "I confirm this story is my own, and I give Valley Run permission to publish it " +
        "along with the photographs I have uploaded. I understand it may appear on the " +
        "Valley Run website and social media, and that I can ask for it to be removed at any time.",
    },

    notifyEmails: { type: [String], default: [] },   // nayi kahani par kise batayein
  },
  { timestamps: true }
);

storySettingsSchema.statics.get = async function () {
  let doc = await this.findOne({ key: "stories" });
  if (!doc) doc = await this.create({ key: "stories" });
  return doc;
};

module.exports = mongoose.model("StorySettings", storySettingsSchema);
