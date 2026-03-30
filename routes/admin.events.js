const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Event = require('../models/Event');
const multer = require('multer');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// @route   GET /api/admin/events
// @desc    Get all events
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: events.length,
      events
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/admin/events/:id
// @desc    Get single event
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.status(200).json({
      success: true,
      event
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/admin/events
// @desc    Create event
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const eventData = req.body;

    // Create event
    const event = await Event.create(eventData);

    res.status(201).json({
      success: true,
      event
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/events/:id
// @desc    Update event
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      event: updatedEvent
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/admin/events/:id
// @desc    Delete event
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    await Event.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/admin/events/upload
// @desc    Upload image to cloudinary
// @access  Private
router.post('/upload', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Convert buffer to base64
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;

    const result = await uploadToCloudinary(dataURI, 'events');

    res.status(200).json({
      success: true,
      url: result.url,
      public_id: result.public_id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Upload failed',
      error: error.message
    });
  }
});

module.exports = router;