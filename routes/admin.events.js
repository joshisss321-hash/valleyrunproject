const express = require("express");
const router = express.Router();

const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");

const Event = require("../models/Event");

const upload = multer({ dest: "uploads/" });

/* ===============================
   🔥 IMAGE UPLOAD (SINGLE)
================================ */
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path);

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      url: result.secure_url,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

/* ===============================
   🔥 MULTIPLE GALLERY UPLOAD
================================ */
router.post("/upload-multiple", upload.array("images", 10), async (req, res) => {
  try {
    const urls = [];

    for (let file of req.files) {
      const result = await cloudinary.uploader.upload(file.path);
      urls.push(result.secure_url);
      fs.unlinkSync(file.path);
    }

    res.json({
      success: true,
      urls,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Multi upload failed" });
  }
});

/* ===============================
   CREATE EVENT
================================ */
router.post("/", async (req, res) => {
  try {
    const event = await Event.create(req.body);
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ error: "Create failed" });
  }
});

/* ===============================
   UPDATE EVENT
================================ */
router.put("/:id", async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

module.exports = router;