const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: 587,
  secure: false,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

  tls: {
    rejectUnauthorized: false,
    ciphers: "SSLv3",
  },

  // ✅ Render ke liye optimized timeouts
  connectionTimeout: 60000,
  greetingTimeout: 30000,
  socketTimeout: 60000,

  // ✅ Pool OFF karo — Render pe pool issue hota hai
  pool: false,
});

const sendEmail = async ({ to, subject, html }) => {
  try {
    console.log("📧 Sending email to:", to);

    // ✅ Har baar fresh transporter banao — Render pe yahi kaam karta hai
    const freshTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
        ciphers: "SSLv3",
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
    });

    const info = await freshTransporter.sendMail({
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
