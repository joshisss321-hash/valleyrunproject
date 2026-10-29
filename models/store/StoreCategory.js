const mongoose = require("mongoose");

/* Valley Store ki category — "Pahadi Ghee", "Atta & Grains" waghairah.
   Collection alag hai (storecategories), Valley Run ke kisi bhi collection
   ko chhuti nahi. */
const storeCategorySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "" },

    image:    { type: String, default: "" },
    imageAlt: { type: String, default: "" },

    // Homepage par kis kram mein dikhe — chhota number pehle
    sortOrder:   { type: Number,  default: 0 },
    isPublished: { type: Boolean, default: false }, // soch-samajh kar live karna
    isFeatured:  { type: Boolean, default: false },

    seoTitle:       { type: String, default: "" },
    seoDescription: { type: String, default: "" },
  },
  { timestamps: true }
);

storeCategorySchema.index({ isPublished: 1, sortOrder: 1 });

module.exports = mongoose.model("StoreCategory", storeCategorySchema);
