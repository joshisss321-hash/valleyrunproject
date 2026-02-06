const express = require("express");
const router = express.Router(); // ✅ THIS WAS MISSING

const {
  createOrder,
  verifyPayment,
} = require("../controllers/payment.controller");

// ===============================
// PAYMENT ROUTES
// ===============================

// Create Razorpay Order
router.post("/create-order", createOrder);

// Verify Payment
router.post("/verify-payment", verifyPayment);

module.exports = router;
