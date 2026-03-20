// const mongoose = require("mongoose");

// const registrationSchema = new mongoose.Schema(
//   {
//     user: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//     },

//     event: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Event",
//       required: true,
//     },

//     category: {
//       type: String,
//       required: true,
//     },

//     paymentId: {
//       type: String,
//       required: true,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// module.exports = mongoose.model("Registration", registrationSchema);
const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    category: {
      type: String,
      required: true,
    },

    paymentId: {
      type: String,
      required: true,
    },

    // ✅ YE ADD KARO
    orderId: {
      type: String,
    },

    // ✅ YE BHI ADD KARO
    status: {
      type: String,
      default: "paid",
    },

  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Registration", registrationSchema);