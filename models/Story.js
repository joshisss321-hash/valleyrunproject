const mongoose = require("mongoose");

/* "Beyond the Finish Line" — runner apni kahani bhejta hai.
   Ye MedalReview se alag hai: wo do line ka testimonial hai, ye poori
   kahani — isliye apna model, apna review flow, apni consent. */

const BADGES = ["", "featured", "story_of_week", "community_inspiration", "journey_of_month"];
const STATUS = ["pending", "approved", "published", "rejected"];

/* Kahani ki kism. "" = jab admin ne abhi tay nahi kiya — aisi kahani
   bhi list mein rehti hai, bas kisi filter ke neeche nahi aati. */
const CATEGORIES = [
  "",
  "running_journey",
  "fitness_transformation",
  "beginner_story",
  "walking_journey",
  "cycling_journey",
  "overcoming_challenges",
  "personal_achievement",
];

const storySchema = new mongoose.Schema(
  {
    /* ── Kisne bheji ── */
    user:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name:  { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, default: "", trim: true },
    city:  { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    instaId: { type: String, default: "", trim: true },

    /* ── Kahani ── */
    title:   { type: String, required: true, trim: true },
    slug:    { type: String, unique: true, lowercase: true, trim: true, index: true },
    summary: { type: String, default: "" },     // card aur share par
    body:    { type: String, required: true },

    photos: {
      type: [{ _id: false, url: String, caption: { type: String, default: "" } }],
      default: [],
    },
    featuredPhoto: { type: String, default: "" },

    // Kis challenge se judi hai (optional)
    eventSlug:  { type: String, default: "" },
    eventTitle: { type: String, default: "" },

    /* ── CONSENT ──
       Sabse zaroori hissa. Kisi ki kahani ya photo bina ijazat ke
       chhapna galat bhi hai aur khatarnak bhi. Isliye ijazat ek
       boolean nahi — kab di, aur KYA likha tha jispe haan ki, wo bhi
       sambhal kar rakhte hain. Baad mein koi sawaal uthe to jawab hai. */
    consent: {
      publishStory:  { type: Boolean, default: false },
      publishPhotos: { type: Boolean, default: false },
      publishName:   { type: Boolean, default: false },
      agreedAt:      { type: Date,   default: null },
      agreedText:    { type: String, default: "" },   // hu-ba-hu wahi text
    },

    /* ── Review ── */
    status:     { type: String, enum: STATUS, default: "pending" },
    adminNote:  { type: String, default: "" },
    reviewedBy: { type: String, default: "" },
    reviewedAt: { type: Date,   default: null },
    publishedAt:{ type: Date,   default: null },

    /* ── Badge ── */
    badge: { type: String, enum: BADGES, default: "" },

    /* Kis tarah ki kahani — page par filter ke liye.
       Khali chhodna theek hai; filter mein wo kahani sirf "All" ke
       neeche aayegi, gayab nahi hogi. */
    category: { type: String, enum: CATEGORIES, default: "" },

    /* ── Homepage par ──
       Admin tay karta hai. Koi "apne aap chun lo" nahi — spec bhi yahi
       kehta hai, aur editorial control admin ke paas hi rehna chahiye. */
    onHomepage:    { type: Boolean, default: false },
    homepageOrder: { type: Number,  default: 0 },
    homepageFrom:  { type: Date,    default: null },
    homepageUntil: { type: Date,    default: null },

    /* ── Story of the week ── */
    isStoryOfWeek: { type: Boolean, default: false },
    weekFrom:      { type: Date, default: null },
    weekUntil:     { type: Date, default: null },

    /* ── Hatane ki guzarish ──
       Participant kabhi bhi keh sakta hai "meri kahani hata do". */
    removalRequestedAt: { type: Date,   default: null },
    removalNote:        { type: String, default: "" },

    seoTitle:       { type: String, default: "" },
    seoDescription: { type: String, default: "" },

    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* Public listing: sirf published, naye pehle */
storySchema.index({ status: 1, publishedAt: -1 });
storySchema.index({ status: 1, onHomepage: 1, homepageOrder: 1 });
storySchema.index({ status: 1, isStoryOfWeek: 1 });

/**
 * Ye kahani ABHI public dikhni chahiye?
 * Teen shart: published ho, consent ho, aur hatane ki guzarish na ho.
 * Ek hi jagah — har route apna hisaab lagata to kahin na kahin chook jaata.
 */
storySchema.methods.isLive = function () {
  return (
    this.status === "published" &&
    this.consent?.publishStory === true &&
    !this.removalRequestedAt
  );
};

/** Homepage par abhi dikhni chahiye? (tareekh bhi dekhte hain) */
storySchema.methods.isOnHomepageNow = function (now = new Date()) {
  if (!this.isLive() || !this.onHomepage) return false;
  if (this.homepageFrom  && now < this.homepageFrom)  return false;
  if (this.homepageUntil && now > this.homepageUntil) return false;
  return true;
};

/** Is hafte ki kahani hai? */
storySchema.methods.isWeeklyNow = function (now = new Date()) {
  if (!this.isLive() || !this.isStoryOfWeek) return false;
  if (this.weekFrom  && now < this.weekFrom)  return false;
  if (this.weekUntil && now > this.weekUntil) return false;
  return true;
};

storySchema.statics.BADGES = BADGES;
storySchema.statics.CATEGORIES = CATEGORIES;
storySchema.statics.STATUS = STATUS;

module.exports = mongoose.model("Story", storySchema);
module.exports.BADGES = BADGES;
module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUS = STATUS;
