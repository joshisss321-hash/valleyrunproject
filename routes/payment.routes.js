const express = require("express");


// ⚠️ IMPORTANT:
// Controller file name & path MUST exactly match (Linux case-sensitive)
const {
  createOrder,
  verifyPayment,
} = require("../controllers/payment.controller");

// ===============================
// PAYMENT ROUTES
// ===============================
const router = express.Router();
// Create Razorpay Order
router.post("/create-order", createOrder);

// Verify Razorpay Payment
router.post("/verify-payment", verifyPayment);

module.exports = router;
