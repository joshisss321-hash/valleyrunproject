const mongoose = require("mongoose");

/* Homepage ke stories section ki settings — ek hi document.
   Heading aur consent ka text yahan isliye hai taaki admin bina deploy
   ke badal sake. Consent ka text badalna khaas kaam ka hai: jo text
   participant ne dekha tha wahi uski kahani ke saath save hota hai. */
const storySettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "stories", unique: true },

    sectionEnabled: { type: Boolean, default: false },  // default BAND

    /* /stories page ka hero.
       Photo admin upload karega. Main wo photo bana nahi sakta, aur
       koi stock photo daal dena brand ke saath dhokha hoga — isliye
       jagah banayi hai, photo nahi. Khali rahe to page khud ek saaf
       dark hero dikha deta hai, toota hua nahi lagta. */
    pageHeroImage:   { type: String, default: "" },

    /* "|" jahan hai wahan nayi line shuru hoti hai aur uske baad ka
       hissa laal ho jaata hai. */
    pageHeroHeading: { type: String, default: "Beyond the | Finish Line." },
    pageHeroText: {
      type: String,
      default:
        "Behind every medal is a journey of dedication, determination, challenges " +
        "and small victories. Discover the real people and the miles behind them.",
    },
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
        "I confirm that this is my personal story and give Valley Run permission to " +
        "review and publish my submitted story and photographs if selected.",
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
