const mongoose = require("mongoose");

/* Ek referral link par ek visit.

   ⚠️ Yahan kisi ka IP, naam ya email nahi rakha jaata. Sirf
   `visitorHash` — IP+browser ka ek taraf ka hash, jisse wapas IP
   nikalna mumkin nahi. Uska ek hi kaam hai: ek hi bande ke baar-baar
   refresh karne ko do alag log na ginn lein. */

const referralClickSchema = new mongoose.Schema(
  {
    code:         { type: String, required: true, uppercase: true, trim: true },
    influencer:   { type: mongoose.Schema.Types.ObjectId, ref: "Influencer", required: true },

    /* Landing page ka event, agar link kisi event page par gaya tha */
    event:        { type: mongoose.Schema.Types.ObjectId, ref: "Event", default: null },
    eventSlug:    { type: String, default: "" },

    visitorHash:  { type: String, default: "", index: true },
    landingPage:  { type: String, default: "" },

    source:       { type: String, default: "" },
    medium:       { type: String, default: "" },
    campaign:     { type: String, default: "" },
  },
  { timestamps: true }
);

/* Influencer ka apna hisaab nikalne ke liye */
referralClickSchema.index({ influencer: 1, createdAt: -1 });
/* Unique visitors ginne ke liye */
referralClickSchema.index({ influencer: 1, visitorHash: 1 });

module.exports = mongoose.model("ReferralClick", referralClickSchema);
