const express = require("express");
const router = express.Router();
const { submitMedalReview } = require("../controllers/medalReview.controller");
const multer = require("multer");
 
const upload = multer({ storage: multer.memoryStorage() });
 
router.post("/submit-medal-review", upload.single("image"), submitMedalReview);
 
module.exports = router;