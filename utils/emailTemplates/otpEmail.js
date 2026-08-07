/**
 * Login OTP email.
 * Baaki Valley Run mails jaisa hi look — red header, white card.
 */
module.exports = ({ name = "Runner", code, ttlMinutes = 10 }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;margin:0;padding:0}
    .container{max-width:600px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
    .header{background:linear-gradient(135deg,#dc2626,#b91c1c);padding:32px;text-align:center}
    .header h1{color:#fff;margin:0;font-size:22px}
    .header p{color:rgba(255,255,255,.85);margin:8px 0 0;font-size:14px}
    .body{padding:32px}
    .greeting{font-size:17px;font-weight:bold;color:#111;margin-bottom:12px}
    .message{color:#555;line-height:1.7;font-size:14px;margin-bottom:24px}
    .code-box{background:#fef2f2;border:2px dashed #dc2626;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px}
    .code{font-size:38px;font-weight:bold;letter-spacing:10px;color:#dc2626;font-family:'Courier New',monospace}
    .code-note{color:#888;font-size:12px;margin-top:10px}
    .warn{background:#f9fafb;border-left:3px solid #d1d5db;padding:12px 16px;color:#666;font-size:13px;line-height:1.6;border-radius:4px}
    .footer{background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb}
    .footer p{color:#888;font-size:12px;margin:4px 0}
    .footer a{color:#dc2626;text-decoration:none}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Your Login Code</h1>
      <p>Valley Run Profile</p>
    </div>

    <div class="body">
      <div class="greeting">Hello ${name},</div>
      <p class="message">
        Apne Valley Run profile mein login karne ke liye ye code daaliye:
      </p>

      <div class="code-box">
        <div class="code">${code}</div>
        <div class="code-note">Ye code ${ttlMinutes} minute mein expire ho jayega</div>
      </div>

      <div class="warn">
        Agar aapne login request nahi ki, to is mail ko ignore kar dijiye —
        aapka account bilkul surakshit hai. Ye code kisi ke saath share na karein.
        Valley Run team kabhi aapse OTP nahi maangti.
      </div>
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
