const registrationSuccessTemplate = ({ name, eventTitle }) => {
  return `
  <div style="font-family: Arial, sans-serif; background:#ffffff; padding:24px; max-width:600px; margin:auto;">
    
    <h2 style="color:#dc2626;">🎉 Registration Successful!</h2>

    <p>Hi <strong>${name}</strong>,</p>

    <p>
      Congratulations! Your registration for 
      <strong>${eventTitle}</strong> has been successfully completed.
    </p>

    <p>
      🏃‍♂️ Complete your challenge within the given dates and give your best!
    </p>

    <p>
      📩 After completing the challenge, please send your activity screenshot 
      (Strava / any fitness app) to this email or WhatsApp for verification.
    </p>

    <hr style="margin:20px 0;" />

    <p style="font-size:14px; color:#555;">
      If you have any questions, feel free to reply to this email.
    </p>

    <p style="margin-top:20px; font-weight:bold;">
      Thank you for giving us your valuable time 🙏
    </p>

    <p style="margin-top:10px;">
      Team <strong>Valley Run</strong><br/>
      Stay Fit. Stay Motivated 💪
    </p>

  </div>
  `;
};

module.exports = registrationSuccessTemplate;
