const mongoose = require("mongoose");

/* Razorpay order banate waqt jo attribution tay hui, wo yahan rakhi
   jaati hai — order id se judi.

   ⚠️ Razorpay ke notes mein kyun nahi? Wahan sirf 15 key allowed hain
   aur hum pehle se 13 use kar rahe hain (isi wajah se coupon ki teen
   cheezein `encodePromo` se ek string mein packed hain). Ek aur cheez
   thoosne se wo nazuk hisaab toot sakta tha. Isliye apni jagah.

   Yahan `payable` bhi save hota hai — yaani jo sach mein charge hua.
   Registration.amount raw event.price se banta hai, early-bird ke baad
   wala asli daam nahi. Revenue ke liye yahi number sahi hai. */

const orderAttributionSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },

    influencer: { type: mongoose.Schema.Types.ObjectId, ref: "Influencer", default: null },
    code:       { type: String, default: "" },

    event:     { type: mongoose.Schema.Types.ObjectId, ref: "Event", default: null },
    eventSlug: { type: String, default: "" },

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

    payable: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* Ye sirf order se registration tak attribution pahunchane ka pul hai.
   Registration par stamp ho jaane ke baad iski zaroorat nahi — 180 din
   baad apne aap mit jaata hai. Jo order kabhi pay hi nahi hue, unka
   kooda bhi isi se saaf ho jaata hai. */
orderAttributionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model("OrderAttribution", orderAttributionSchema);
