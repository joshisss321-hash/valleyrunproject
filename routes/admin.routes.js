// backend/routes/admin.routes.js
// Apni existing admin.routes.js ko is se replace karo

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const adminAuth = require("../middlewares/adminAuth");
const {
  adminLogin,
  getDashboardStats,
  getAllEvents,
  createEvent,
  updateEvent,
  toggleEventField,
  deleteEvent,
  uploadImage,
  updateEventImages,
  getAllRegistrations,
  getEventRegistrations,
} = require("../controllers/admin.controller");

// ─── Multer setup (image upload ke liye) ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only images allowed"), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

// ─── PUBLIC ROUTES ──────────────────────────────────────────────────────────
router.post("/login", adminLogin);

// ─── PROTECTED ROUTES (adminAuth middleware lagega) ──────────────────────────
router.use(adminAuth); // Yahan se neeche sab routes protected hain

// Dashboard
router.get("/dashboard", getDashboardStats);

// Events CRUD
router.get("/events", getAllEvents);
router.post("/events", createEvent);
router.put("/events/:id", updateEvent);
router.patch("/events/:id/toggle", toggleEventField);      // active/reg on-off
router.patch("/events/:id/images", updateEventImages);     // images update
router.delete("/events/:id", deleteEvent);

// Image Upload (Cloudinary)
router.post("/upload", upload.single("image"), uploadImage);

// Registrations
router.get("/registrations", getAllRegistrations);
router.get("/events/:id/registrations", getEventRegistrations);

module.exports = router;
