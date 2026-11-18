const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iem_admissions', {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB] Connected to host: ${conn.connection.host}, Database: ${conn.connection.name}`);
  } catch (error) {
    console.warn(`[MongoDB Notice]: Local MongoDB service is not running (${error.message}).`);
    console.log(`[Database Fallback]: Using built-in In-Memory Database with pre-seeded data.`);
  }
};

module.exports = connectDB;
