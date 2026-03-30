require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

const createAdmin = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI not found in .env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const admin = await Admin.create({
      username: 'admin',
      email: 'admin@valleyrun.com',
      password: 'valleyrun321',
      role: 'admin',
      isActive: true
    });

    console.log('✅ Admin created:', admin.email);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

createAdmin();