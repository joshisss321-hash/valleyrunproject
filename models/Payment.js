const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
  razorpay_order_id: String,
  razorpay_payment_id: String,
  razorpay_signature: String,
  amount: Number,
  status: String,
}, { timestamps: true });

module.exports = mongoose.model("Payment", PaymentSchema);
