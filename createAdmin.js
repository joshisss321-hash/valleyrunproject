const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createAdmin() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB...');

  const hash = await bcrypt.hash('Admin@123', 12);

  await mongoose.connection.collection('admins').insertOne({
    username: 'valleyrun_admin',
    email: 'admin@valleyrun.in',
    password: hash,
    role: 'admin',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log('✅ Admin created successfully!');
  console.log('Email: admin@valleyrun.in');
  console.log('Password: Admin@123');
  process.exit(0);
}

createAdmin().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});