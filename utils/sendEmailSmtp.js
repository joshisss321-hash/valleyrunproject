const nodemailer = require("nodemailer");

/**
 * Gmail SMTP se email — Brevo se alag, poori tarah swatantra raasta.
 *
 * Kyun: Brevo OTP emails ko HTTP 201 dekar sweekar to kar leta hai par
 * na bhejta hai na apne logs mein dikhata hai (registration mails wahi
 * key se theek jaati hain). OTP ab login ka zariya hai, isliye use kisi
 * ek provider ke bharose nahi chhod sakte.
 *
 * Gmail ki free limit ~500 email/din hai — OTP ke liye kaafi zyada.
 *
 * EMAIL_USER / EMAIL_PASS .env mein chahiye (PASS = Google App Password,
 * account ka asli password nahi).
 */

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporter;
};

/** @returns {Promise<boolean>} sach mein gayi ya nahi */
const sendEmailSmtp = async ({ to, subject, html }) => {
  const tx = getTransporter();

  if (!tx) {
    console.warn("⚠️  SMTP skip — EMAIL_USER / EMAIL_PASS .env mein nahi hain");
    return false;
  }

  try {
    const info = await tx.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || "Valley Run"}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log(`✅ Email sent via Gmail SMTP → ${to}  [id: ${info.messageId}]`);
    return true;
  } catch (err) {
    console.error(`❌ SMTP FAIL → ${to}`);
    console.error(`   Wajah: ${err.message}`);
    if (/invalid login|username and password/i.test(err.message)) {
      console.error("   Ishara: EMAIL_PASS ko Google App Password hona chahiye,");
      console.error("           account ka aam password nahi chalega.");
    }
    return false;
  }
};

module.exports = sendEmailSmtp;
module.exports.isConfigured = () =>
  Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
