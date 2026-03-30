const router = require("express").Router();

const User = require("../models/User");
const Registration = require("../models/Registration");
const RunSubmission = require("../models/RunSubmission");

router.get("/stats", async (req, res) => {
  const users = await User.countDocuments();
  const registrations = await Registration.countDocuments();
  const submissions = await RunSubmission.countDocuments();
  const certificates = await RunSubmission.countDocuments({
    certificateSent: true
  });

  res.json({
    users,
    registrations,
    submissions,
    certificates
  });
});

module.exports = router;