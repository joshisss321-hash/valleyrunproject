// backend/controllers/admin.controller.js
// Ye file create karo — sab admin operations yahan honge

const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const cloudinary = require("cloudinary").v2;

// ─── Cloudinary Config ───────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────
// POST /api/admin/login
exports.adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    // .env se admin credentials check karo
    if (
      username !== process.env.ADMIN_USERNAME ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { username, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ success: true, token, message: "Login successful" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DASHBOARD STATS ─────────────────────────────────────────────────────────
// GET /api/admin/dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    const [totalRegistrations, activeEvents, closedEvents, allRegs] = await Promise.all([
      Registration.countDocuments(),
      Event.countDocuments({ active: true }),
      Event.countDocuments({ active: false }),
      Registration.find().select("amount createdAt"),
    ]);

    // Total revenue
    const totalRevenue = allRegs.reduce((sum, r) => sum + (r.amount || 0), 0);

    // Is hafte ki registrations (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weeklyRegs = await Registration.countDocuments({ createdAt: { $gte: weekAgo } });

    // Har din ki registrations (last 7 days chart ke liye)
    const dailyData = [];
    for (let i = 6; i >= 0; i--) {
      const start = new Date();
      start.setDate(start.getDate() - i);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      const count = await Registration.countDocuments({
        createdAt: { $gte: start, $lte: end },
      });
      dailyData.push({ date: start.toLocaleDateString("en-IN", { weekday: "short" }), count });
    }

    res.json({
      success: true,
      stats: {
        totalRegistrations,
        activeEvents,
        closedEvents,
        totalRevenue,
        weeklyRegistrations: weeklyRegs,
        dailyChart: dailyData,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET ALL EVENTS ───────────────────────────────────────────────────────────
// GET /api/admin/events
exports.getAllEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });

    // Har event ke saath registration count bhi bhejo
    const eventsWithCount = await Promise.all(
      events.map(async (ev) => {
        const regCount = await Registration.countDocuments({ event: ev._id });
        return { ...ev.toObject(), registrationCount: regCount };
      })
    );

    res.json({ success: true, events: eventsWithCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── CREATE EVENT ─────────────────────────────────────────────────────────────
// POST /api/admin/events
exports.createEvent = async (req, res) => {
  try {
    const {
      title, slug, price, dates, description,
      categories, active, registrationOpen,
      registrationDeadline, isPrevious, maxParticipants,
    } = req.body;

    // Slug unique hai ya nahi check karo
    const existing = await Event.findOne({ slug });
    if (existing) {
      return res.status(400).json({ success: false, message: "Slug already exists. Use a different one." });
    }

    const event = new Event({
      title, slug, price, dates, description,
      categories: Array.isArray(categories) ? categories : [categories],
      active: active ?? true,
      registrationOpen: registrationOpen ?? true,
      registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null,
      isPrevious: isPrevious ?? false,
      maxParticipants: maxParticipants || null,
    });

    await event.save();
    res.status(201).json({ success: true, event, message: "Event created!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── UPDATE EVENT ─────────────────────────────────────────────────────────────
// PUT /api/admin/events/:id
exports.updateEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    res.json({ success: true, event, message: "Event updated!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── TOGGLE EVENT STATUS ──────────────────────────────────────────────────────
// PATCH /api/admin/events/:id/toggle
// Body: { field: "active" | "registrationOpen" | "isPrevious", value: true/false }
exports.toggleEventField = async (req, res) => {
  try {
    const { field, value } = req.body;
    const allowedFields = ["active", "registrationOpen", "isPrevious"];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({ success: false, message: "Invalid field" });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { [field]: value, updatedAt: new Date() },
      { new: true }
    );
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    res.json({ success: true, event, message: `${field} updated to ${value}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE EVENT ─────────────────────────────────────────────────────────────
// DELETE /api/admin/events/:id
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    res.json({ success: true, message: "Event deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── UPLOAD IMAGE (Cloudinary) ────────────────────────────────────────────────
// POST /api/admin/upload
// Body: multipart form — field: "image", plus "type": "hero"|"cover"|"medal"|"medalBack"|"gallery"
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const folder = `valleyrun/${req.body.type || "general"}`;
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder,
      quality: "auto",
      fetch_format: "auto",
    });

    res.json({ success: true, url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── UPDATE EVENT IMAGES ──────────────────────────────────────────────────────
// PATCH /api/admin/events/:id/images
// Body: { image, heroImage, coverImage, medalImage, medalImageBack, gallery }
exports.updateEventImages = async (req, res) => {
  try {
    const updates = {};
    const imageFields = ["image", "heroImage", "coverImage", "medalImage", "medalImageBack"];
    imageFields.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    // Gallery update (push ya replace)
    if (req.body.gallery) {
      updates.gallery = req.body.gallery; // full array bhejo
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    res.json({ success: true, event, message: "Images updated!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET ALL REGISTRATIONS ────────────────────────────────────────────────────
// GET /api/admin/registrations?event=id&category=10km&page=1&limit=20
exports.getAllRegistrations = async (req, res) => {
  try {
    const { event, category, payment, page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (event) filter.event = event;
    if (category) filter.category = category;
    if (payment) filter.paymentStatus = payment;

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [registrations, total] = await Promise.all([
      Registration.find(filter)
        .populate("event", "title slug")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Registration.countDocuments(filter),
    ]);

    res.json({
      success: true,
      registrations,
      pagination: {
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── REGISTRATIONS BY EVENT ───────────────────────────────────────────────────
// GET /api/admin/events/:id/registrations
exports.getEventRegistrations = async (req, res) => {
  try {
    const regs = await Registration.find({ event: req.params.id }).sort({ createdAt: -1 });
    const count = regs.length;
    const revenue = regs.reduce((sum, r) => sum + (r.amount || 0), 0);
    res.json({ success: true, registrations: regs, count, revenue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
