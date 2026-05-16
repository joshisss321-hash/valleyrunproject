const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const fs         = require('fs');
const { protect } = require('../middleware/auth');
const Event      = require('../models/Event');
const Registration = require('../models/Registration');
const ImageKit   = require('imagekit');

const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

const upload = multer({ dest: 'uploads/' });

// GET /api/admin/events
router.get('/', protect, async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 }).lean();
    const withCounts = await Promise.all(
      events.map(async (ev) => ({
        ...ev,
        registrationCount: await Registration.countDocuments({ event: ev._id }),
      }))
    );
    res.json({ success: true, events: withCounts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/events
router.post('/', protect, async (req, res) => {
  try {
    const existing = await Event.findOne({ slug: req.body.slug });
    if (existing) return res.status(400).json({ success: false, message: 'Slug already taken' });
    const event = await Event.create(req.body);
    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ upload-image PEHLE — /:id se PEHLE hona zaroori hai
router.post('/upload-image', protect, upload.single('image'), async (req, res) => {
  const cleanup = () => {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
  };
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const type   = req.query.type || req.body.type || 'general';
    const folder = `/valleyrun/events/${type}`;

    const fileBuffer = fs.readFileSync(req.file.path);
    const result = await imagekit.upload({
      file:     fileBuffer,
      fileName: `${Date.now()}_${req.file.originalname || 'image.jpg'}`,
      folder:   folder,
    });
    cleanup();

    res.json({ success: true, url: result.url });
  } catch (err) {
    cleanup();
    console.error('Image upload error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ gallery routes bhi /:id se PEHLE
router.patch('/:id/gallery/add', protect, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $push: { gallery: req.body.imageUrl } },
      { new: true }
    );
    res.json({ success: true, gallery: event.gallery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id/gallery/remove', protect, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $pull: { gallery: req.body.imageUrl } },
      { new: true }
    );
    res.json({ success: true, gallery: event.gallery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/events/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Not found' });
    const registrationCount = await Registration.countDocuments({ event: event._id });
    res.json({ success: true, event, registrationCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/events/:id
router.put('/:id', protect, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!event) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/events/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;