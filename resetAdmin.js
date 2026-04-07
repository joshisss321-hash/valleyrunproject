const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetAdmin() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB...');

  const hash = await bcrypt.hash('Admin@123', 12);

  const result = await mongoose.connection.collection('admins').updateOne(
    { email: 'admin@valleyrun.in' },
    { $set: { password: hash, isActive: true, updatedAt: new Date() } }
  );

  if (result.modifiedCount > 0) {
    console.log('✅ Password reset successfully!');
    console.log('Email: admin@valleyrun.in');
    console.log('Password: Admin@123');
  } else {
    console.log('❌ Admin not found with that email');
  }
  process.exit(0);
}

resetAdmin().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});