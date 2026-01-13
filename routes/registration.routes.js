const express = require("express");
const User = require("../models/User");
const Event = require("../models/Event");
const Registration = require("../models/Registration");

const router = express.Router();

router.post("/", async (req, res) => {
  const { name, email, phone, eventSlug, category, paymentId } = req.body;

  const event = await Event.findOne({ slug: eventSlug });
  if (!event) return res.status(404).json({ message: "Event not found" });

  let user = await User.findOne({ email });
  if (!user) user = await User.create({ name, email, phone });

  const registration = await Registration.create({
    user: user._id,
    event: event._id,
    payment: paymentId,
    category,
  });

  user.joinedEvents.push(event._id);
  await user.save();

  res.json({
    success: true,
    message: "🎉 Registration complete. Good luck!",
  });
});

module.exports = router;
