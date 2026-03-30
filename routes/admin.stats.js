const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Registration = require('../models/Registration');
const RunSubmission = require('../models/RunSubmission');

// @route   GET /api/admin/stats
// @desc    Get dashboard stats
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const [
      totalUsers,
      totalRegistrations,
      totalSubmissions,
      approvedSubmissions,
      pendingSubmissions
    ] = await Promise.all([
      User.countDocuments(),
      Registration.countDocuments(),
      RunSubmission.countDocuments(),
      RunSubmission.countDocuments({ status: 'approved' }),
      RunSubmission.countDocuments({ status: 'pending' })
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalRegistrations,
        totalSubmissions,
        approvedSubmissions,
        pendingSubmissions,
        certificates: approvedSubmissions
      }
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