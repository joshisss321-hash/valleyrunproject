const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Leaderboard = require('../models/Leaderboard');

// @route   GET /api/admin/leaderboard
// @desc    Get all leaderboard entries
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { event } = req.query;
    
    let query = {};
    if (event) {
      query.event = event;
    }

    const entries = await Leaderboard.find(query)
      .populate('event', 'title')
      .sort({ rank: 1 });

    res.status(200).json({
      success: true,
      count: entries.length,
      entries
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/admin/leaderboard
// @desc    Add leaderboard entry
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const entry = await Leaderboard.create(req.body);
    const populatedEntry = await Leaderboard.findById(entry._id).populate('event', 'title');

    res.status(201).json({
      success: true,
      entry: populatedEntry
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

// @route   PUT /api/admin/leaderboard/:id
// @desc    Update leaderboard entry
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const entry = await Leaderboard.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('event', 'title');

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Entry not found'
      });
    }

    res.status(200).json({
      success: true,
      entry
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/admin/leaderboard/:id
// @desc    Delete leaderboard entry
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const entry = await Leaderboard.findById(req.params.id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Entry not found'
      });
    }

    await Leaderboard.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Entry deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;