/**
 * "Medal dispatch ho gaya" email — tracking ID ke saath.
 */
module.exports = ({
  name = "Runner",
  eventTitle = "Valley Run",
  trackingId = "",
  courier = "",
  trackingUrl = "",
  profileUrl = "https://valleyrun.in/profile",
}) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;margin:0;padding:0}
    .container{max-width:600px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
    .header{background:linear-gradient(135deg,#dc2626,#b91c1c);padding:32px;text-align:center}
    .header h1{color:#fff;margin:0;font-size:23px}
    .header p{color:rgba(255,255,255,.85);margin:8px 0 0;font-size:14px}
    .body{padding:32px}
    .greeting{font-size:17px;font-weight:bold;color:#111;margin-bottom:12px}
    .message{color:#555;line-height:1.7;font-size:14px;margin-bottom:24px}
    .track-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:24px}
    .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
    .row:last-child{border-bottom:none}
    .label{color:#888}
    .value{color:#111;font-weight:600;text-align:right}
    .btn{display:inline-block;background:#dc2626;color:#fff !important;text-decoration:none;padding:13px 30px;border-radius:8px;font-weight:bold;font-size:14px}
    .center{text-align:center;margin-bottom:24px}
    .footer{background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb}
    .footer p{color:#888;font-size:12px;margin:4px 0}
    .footer a{color:#dc2626;text-decoration:none}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 Your Medal Is On Its Way!</h1>
      <p>${eventTitle}</p>
    </div>

    <div class="body">
      <div class="greeting">Hello ${name},</div>
      <p class="message">
        Congratulations! The medal you earned has been shipped 🏅<br>
        Here are your tracking details:
      </p>

      <div class="track-box">
        <div class="row">
          <span class="label">Courier</span>
          <span class="value">${courier || "—"}</span>
        </div>
        <div class="row">
          <span class="label">Tracking ID</span>
          <span class="value">${trackingId || "—"}</span>
        </div>
        <div class="row">
          <span class="label">Status</span>
          <span class="value" style="color:#16a34a">✅ Dispatched</span>
        </div>
      </div>

      ${
        trackingUrl
          ? `<div class="center"><a class="btn" href="${trackingUrl}">Track Shipment →</a></div>`
          : ""
      }

      <div class="center">
        <a class="btn" style="background:#111" href="${profileUrl}">View in My Profile →</a>
      </div>

      <p class="message">
        Delivery usually takes 5-10 days. If anything looks wrong, just reply
        to this email and we will sort it out.<br><br>
        <strong>Team Valley Run</strong>
      </p>
    </div>

    <div class="footer">
      <p><strong>Valley Run Official</strong></p>
      <p><a href="https://valleyrun.in">www.valleyrun.in</a></p>
      <p>📞 8171794766 | 7060148183</p>
      <p><a href="mailto:valleyrun.official@gmail.com">valleyrun.official@gmail.com</a></p>
    </div>
  </div>
</body>
</html>
`;
