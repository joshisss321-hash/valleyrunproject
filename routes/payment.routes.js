const express = require("express");
const router = express.Router();

const {
  createOrder,
  verifyPayment,
} = require("../controllers/payment.controller");

// 🔹 Create Razorpay order
router.post("/create-order", createOrder);

// 🔹 Verify payment (THIS WAS MISSING / WRONG)
router.post("/verify-payment", verifyPayment);

module.exports = router;
