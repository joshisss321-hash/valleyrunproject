const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT), // 587
  secure: false,

  auth: {
    user: process.env.EMAIL_USER, // a00293001@smtp-brevo.com
    pass: process.env.EMAIL_PASS, // Brevo SMTP password
  },

  // 🔥 RENDER FIX (MOST IMPORTANT)
  tls: {
    rejectUnauthorized: false,
  },

  pool: true,
  maxConnections: 1,
  maxMessages: 5,

  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000,
});

const sendEmail = async ({ to, subject, html }) => {
  try {
    console.log("📧 Sending email to:", to);

    const info = await transporter.sendMail({
      from: `"Valley Run" <${process.env.EMAIL_REPLY_TO}>`,
      to,
      replyTo: process.env.EMAIL_REPLY_TO,
      subject,
      html,
    });

    console.log("✅ Email sent:", info.messageId);
    return true;
  } catch (err) {
    console.error("❌ Email error:", err.message);
    return false;
  }
};

module.exports = sendEmail;
