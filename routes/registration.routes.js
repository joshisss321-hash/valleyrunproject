// const express = require("express");
// const User = require("../models/User");
// const Event = require("../models/Event");
// const Registration = require("../models/Registration");

// const router = express.Router();

// router.post("/", async (req, res) => {
//   const { name, email, phone, eventSlug, category, paymentId } = req.body;

//   const event = await Event.findOne({ slug: eventSlug });
//   if (!event) return res.status(404).json({ message: "Event not found" });

//   let user = await User.findOne({ email });
//   if (!user) user = await User.create({ name, email, phone });

//   const registration = await Registration.create({
//     user: user._id,
//     event: event._id,
//     payment: paymentId,
//     category,
//   });

//   user.joinedEvents.push(event._id);
//   await user.save();

//   res.json({
//     success: true,
//     message: "🎉 Registration complete. Good luck!",
//   });
// });

// module.exports = router;
// const express = require("express");
// const User = require("../models/User");
// const Event = require("../models/Event");
// const Registration = require("../models/Registration");

// const router = express.Router();

// router.post("/", async (req, res) => {
//   const { name, email, phone, eventSlug, category, paymentId } = req.body;

//   const event = await Event.findOne({ slug: eventSlug });
//   if (!event) return res.status(404).json({ message: "Event not found" });

//   let user = await User.findOne({ email });
//   if (!user) user = await User.create({ name, email, phone });

//   const registration = await Registration.create({
//     user: user._id,
//     event: event._id,
//     payment: paymentId,
//     category,
//   });

//   // 🔥 UPDATED PART (IMPORTANT)
//   const alreadyJoined = user.joinedEvents.find(
//     (e) => e.eventSlug === event.slug
//   );

//   if (!alreadyJoined) {
//     user.joinedEvents.push({
//       eventId: event._id,
//       eventSlug: event.slug,
//     });
//   }

//   await user.save();

//   res.json({
//     success: true,
//     message: "🎉 Registration complete. Good luck!",
//   });
// });

// module.exports = router;
const express = require("express");
const User = require("../models/User");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const sendEmail = require("../utils/sendEmail");
const registrationSuccessTemplate = require("../utils/emailTemplates/registrationSuccess");

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

  const alreadyJoined = user.joinedEvents.find(
    (e) => e.eventSlug === event.slug
  );

  if (!alreadyJoined) {
    user.joinedEvents.push({
      eventId: event._id,
      eventSlug: event.slug,
    });
  }

  await user.save();

  // ✅ Email bhejo — har event ke liye sahi title ke saath
  try {
    const html = registrationSuccessTemplate({
      name: name,
      eventTitle: event.title,
    });

    await sendEmail({
      to: email,
      subject: `🎉 Registration Confirmed – ${event.title}`,
      html,
    });

    console.log("✅ Registration email sent to:", email, "for event:", event.title);
  } catch (emailErr) {
    console.error("❌ Email sending failed:", emailErr.message);
  }

  res.json({
    success: true,
    message: "🎉 Registration complete. Good luck!",
  });
});

module.exports = router;