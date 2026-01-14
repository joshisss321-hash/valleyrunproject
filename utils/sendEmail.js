const SibApiV3Sdk = require("sib-api-v3-sdk");

const client = SibApiV3Sdk.ApiClient.instance;
client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

const api = new SibApiV3Sdk.TransactionalEmailsApi();

async function sendEmail({ to, subject, html }) {
  try {
    console.log("📧 Sending email to:", to);

    await api.sendTransacEmail({
      sender: {
        email: "valleyrun.official@gmail.com",
        name: "Valley Run",
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    });

    console.log("✅ Email sent successfully");
    return true;
  } catch (err) {
    console.error("❌ Email error:", err.message);
    return false;
  }
}

module.exports = sendEmail;
