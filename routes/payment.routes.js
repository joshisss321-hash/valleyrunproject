const express = require("express");
const {
  createOrder,
  verifyPayment,
} = require("../controllers/payment.controller");

const router = express.Router();

router.post("/create-order", createOrder);
router.post("/verify-payment", verifyPayment); // ✅ FIXED

module.exports = router;
