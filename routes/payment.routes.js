const express = require("express");
const router = express.Router();

// ⚠️ IMPORTANT:
// Controller file name & path MUST exactly match (Linux case-sensitive)
const {
  createOrder,
  verifyPayment,
} = require("../controllers/payment.controller");

// ===============================
// PAYMENT ROUTES
// ===============================

// Create Razorpay Order
router.post("/create-order", createOrder);

// Verify Razorpay Payment
router.post("/verify-payment", verifyPayment);

module.exports = router;
