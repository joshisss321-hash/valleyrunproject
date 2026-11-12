const mongoose = require("mongoose");

/* Influencer — jise hum apna link dete hain aur jiska asar naapna hai.

   ⚠️ Ye User.referralCode wale runner-to-runner referral se bilkul ALAG
   cheez hai. Wo checkout par discount deta hai; ye sirf ginti karta hai
   ki kaun kahan se aaya. Isliye alag model, alag code space, aur link
   mein alag parameter (?via=) — taaki dono kabhi na takrayein. */

const influencerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    /* Hamesha bina @ ke save hota hai — warna link banate waqt @@ ban
       jaata hai aur Instagram par 404 milta hai. */
    instagramUsername: { type: String, default: "", trim: true },

    email: { type: String, default: "", lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true },

    /* Link ka code: /challenges/<slug>?via=CODE
       Sirf A-Z aur 0-9 — log ise bolte aur type karte hain. */
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    /* Kin events ko promote kar raha hai. Khali list ka matlab "abhi
       koi event tay nahi" — tab kisi registration ka credit nahi
       milega, par click phir bhi ginne jayenge. */
    eventIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }],

    /* Band karne par purana data jaisa ka taisa rehta hai, bas naya
       credit milna ruk jaata hai. Delete se behtar yahi hai. */
    isActive: { type: Boolean, default: true, index: true },

    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

/** Code saaf karna — har jagah ek hi tareeka. */
influencerSchema.statics.cleanCode = (raw) =>
  String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);

module.exports = mongoose.model("Influencer", influencerSchema);
