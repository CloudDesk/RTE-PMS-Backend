const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://******:*******@cluster0.0ktur.mongodb.net/hrms_production?retryWrites=true&w=majority&appName=Cluster0');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const fixUAEUsersBiometricId = async () => {
  try {
    console.log('🔧 Starting UAE users biometricId cleanup...');
    
    // Get all UAE users with null biometricId
    const uaeUsers = await mongoose.connection.db.collection('users').find({
      country: 'AE',
      biometricId: null
    }).toArray();
    
    console.log(`📊 Found ${uaeUsers.length} UAE users with null biometricId`);
    
    if (uaeUsers.length > 0) {
      // Remove biometricId field entirely for UAE users only
      const result = await mongoose.connection.db.collection('users').updateMany(
        { country: 'AE', biometricId: null },
        { $unset: { biometricId: 1 } }
      );
      
      console.log(`✅ Updated ${result.modifiedCount} UAE users - removed biometricId field`);
      console.log('ℹ️  Note: Only UAE users were affected. Other countries remain unchanged.');
    }
    
    console.log('🎉 UAE users biometricId cleanup completed successfully');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await mongoose.connection.close();
    console.log('📡 Database connection closed');
  }
};

// Run the script
connectDB().then(() => {
  fixUAEUsersBiometricId();
});
