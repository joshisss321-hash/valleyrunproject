const mongoose = require("mongoose");

/* Medal Store ki apni settings — ek hi document.

   ⚠️ Pahadi store ki `StoreSettings` jaan-bujh kar alag chhodi hai.
   Usme FSSAI, shelf life, ingredients aur Pahadi hero copy jaise
   field hain jinka medal se koi lena-dena nahi; aur dono admin
   screens ek hi document likhti to ek doosre ka kaam mita sakti
   thi. Isliye chhota, apna document. */

const medalSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "medal", unique: true },

    storeName: { type: String, default: "Valley Run Medal Store" },
    tagline:   { type: String, default: "Medals from our past challenges — while they last." },

    /* ── Shipping ──
       Flat charge, aur itne se upar free. `freeOver: 0` matlab free
       wali baat band. Dono admin se badalte hain. COD nahi hai. */
    shippingFlat: { type: Number, default: 0, min: 0 },
    freeOver:     { type: Number, default: 0, min: 0 },

    supportEmail: { type: String, default: "" },
    supportPhone: { type: String, default: "" },

    /* Page ka upar ka hissa */
    /* ⚠️ Hero ka text YAHIN se aata hai, page ke JSX se nahi.
       Page par likha fallback kabhi nahi chalta kyunki ye default
       hamesha maujood hota hai — isliye asli copy yahan rakhi hai,
       aur admin ise Settings se badal sakta hai. */
    heroHeading: { type: String, default: "Own a piece of the finish line." },
    heroText: {
      type: String,
      default:
        "These are the real medals from our past challenges — the same ones that went " +
        "out to finishers. A handful are left over, and once they are gone we are not " +
        "making them again.",
    },
    heroImage: { type: String, default: "" },

    /* Order ke baad kya kehna hai */
    dispatchNote: {
      type: String,
      default: "We dispatch within 5–7 working days and will email your tracking number.",
    },

    shippingPolicy: { type: String, default: "" },
    returnPolicy:   { type: String, default: "" },

    /* Naya order aane par kinko email jaye */
    notifyEmails: { type: [String], default: [] },
  },
  { timestamps: true }
);

medalSettingsSchema.statics.get = async function () {
  let doc = await this.findOne({ key: "medal" });
  if (!doc) doc = await this.create({ key: "medal" });
  return doc;
};

/** Shipping ka hisaab — ek hi jagah, taaki checkout aur page kabhi
 *  alag daam na dikhayein. `subtotal` discount ke baad wala ho. */
medalSettingsSchema.statics.shippingFor = function (settings, subtotal) {
  const flat = Number(settings?.shippingFlat) || 0;
  const free = Number(settings?.freeOver) || 0;
  if (flat <= 0) return 0;
  if (free > 0 && Number(subtotal) >= free) return 0;
  return flat;
};

module.exports = mongoose.model("MedalSettings", medalSettingsSchema);
