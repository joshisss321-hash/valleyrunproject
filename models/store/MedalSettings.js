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

    /* ── Zyada medal, kam daam ──
       Pehle medal par kuch nahi; uske baad har medal par itne rupee
       chhoot. 3 medal = 2 × perExtraOff ki chhoot.

       Alag-alag event ke medal bhi ek hi ginti mein aate hain —
       cart bada karne ka yahi matlab hai.

       0 kar do to chhoot band. */
    perExtraOff: { type: Number, default: 20, min: 0 },

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

/** Kitni chhoot milegi.
 *
 *  ⚠️ Ye hisaab SIRF yahan hai. Page, cart aur checkout teeno isi
 *  ko bulate hain, warna teeno alag daam dikhane lagte — aur jo
 *  daam page par dikha tha usse zyada charge hona sabse buri baat
 *  hoti hai.
 *
 *  Koi percentage ki hadd nahi (ye jaan-bujh kar). Par total kabhi
 *  0 ya minus nahi ho sakta — Razorpay us par charge hi nahi kar
 *  sakta — isliye chhoot subtotal se ek rupaya kam par ruk jaati
 *  hai. Coupon wale code mein bhi yahi rok pehle se hai. */
medalSettingsSchema.statics.bulkOff = function (settings, totalQty, subtotal) {
  const per = Number(settings?.perExtraOff) || 0;
  const n = Math.floor(Number(totalQty) || 0);
  if (per <= 0 || n <= 1) return 0;

  const raw = per * (n - 1);
  return Math.max(0, Math.min(raw, Math.max(0, subtotal - 1)));
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
