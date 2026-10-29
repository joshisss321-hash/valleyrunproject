const mongoose = require("mongoose");

/* Customer ke sahej kar rakhe pate. Valley Run ke User par ek hi pata hai
   (medal ke liye) — store mein log ghar, office, kisi aur ka pata, sab
   rakhna chahte hain, isliye alag collection. */
const storeAddressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    label: { type: String, default: "Home" },
    name:  { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },

    line1:    { type: String, required: true, trim: true },
    line2:    { type: String, default: "", trim: true },
    landmark: { type: String, default: "", trim: true },
    city:     { type: String, required: true, trim: true },
    state:    { type: String, required: true, trim: true },
    pincode:  { type: String, required: true, trim: true },
    country:  { type: String, default: "India" },

    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

storeAddressSchema.index({ user: 1, isDefault: -1, updatedAt: -1 });

module.exports = mongoose.model("StoreAddress", storeAddressSchema);
