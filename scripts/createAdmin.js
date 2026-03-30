require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const admin = await Admin.create({
      username: 'admin',
      email: 'admin@yourdomain.com',
      password: 'YourSecurePassword123!',
      role: 'super-admin'
    });

    console.log('Admin created:', admin.email);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

createAdmin();