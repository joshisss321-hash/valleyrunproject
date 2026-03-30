const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const RunSubmission = require('../models/RunSubmission');

// @route   GET /api/admin/submissions
// @desc    Get all submissions
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = {};
    if (status) {
      query.status = status;
    }

    const submissions = await RunSubmission.find(query)
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      count: submissions.length,
      submissions
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/admin/submissions/:id/approve
// @desc    Approve submission
// @access  Private
router.put('/:id/approve', protect, async (req, res) => {
  try {
    const submission = await RunSubmission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    submission.status = 'approved';
    await submission.save();

    res.status(200).json({
      success: true,
      submission
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/admin/submissions/:id/reject
// @desc    Reject submission
// @access  Private
router.put('/:id/reject', protect, async (req, res) => {
  try {
    const submission = await RunSubmission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    submission.status = 'rejected';
    await submission.save();

    res.status(200).json({
      success: true,
      submission
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/admin/submissions/:id
// @desc    Delete submission
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const submission = await RunSubmission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    await RunSubmission.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Submission deleted successfully'
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