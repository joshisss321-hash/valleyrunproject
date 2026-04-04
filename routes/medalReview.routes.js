const express = require("express");
const router = express.Router();
const multer = require("multer");
const { submitMedalReview } = require("../controllers/medalReview.controller");

// ✅ same as run.routes.js
const upload = multer({ dest: "uploads/" });

router.post("/submit-medal-review", upload.single("image"), submitMedalReview);

module.exports = router;