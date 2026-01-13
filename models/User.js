const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    phone: {
      type: String,
      required: true,
    },

    // 🔽 ADDRESS FIELDS (IMPORTANT)
    address1: String,
    address2: String,
    landmark: String,
    city: String,
    state: String,
    pincode: String,

    source: String,

    joinedEvents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
