const mongoose = require('mongoose');
require('dotenv').config();

// Import your models to ensure they're registered
// Note: Models will be auto-registered when Mongoose connects

async function verifyDatabase() {
  try {
    console.log('🔍 Verifying database connection and collections...');
    
    // Get the MongoDB URI from config
    const mongoUri ='mongodb+srv://sachioncloud:Maples7123456789@cluster0.0ktur.mongodb.net/hrms_production?retryWrites=true&w=majority&appName=Cluster0';
    
    console.log(`🔌 Connecting to: ${mongoUri}`);
    
    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB successfully!');
    
    // Get database name
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Database name: ${dbName}`);
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\n📋 Found ${collections.length} collections:`);
    
    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      console.log(`  - ${collection.name}: ${count} documents`);
    }
    
    // Test model operations
    console.log('\n🧪 Testing model operations...');
    
    // Test User model
    try {
      const User = mongoose.model('User');
      const userCount = await User.countDocuments();
      console.log(`  ✅ User model: ${userCount} users found`);
    } catch (error) {
      console.log(`  ⚠️  User model not found (will be created when app starts): ${error.message}`);
    }
    
    // Test Leave model
    try {
      const Leave = mongoose.model('Leave');
      const leaveCount = await Leave.countDocuments();
      console.log(`  ✅ Leave model: ${leaveCount} leaves found`);
    } catch (error) {
      console.log(`  ⚠️  Leave model not found (will be created when app starts): ${error.message}`);
    }
    
    // Test Payroll model
    try {
      const Payroll = mongoose.model('Payroll');
      const payrollCount = await Payroll.countDocuments();
      console.log(`  ✅ Payroll model: ${payrollCount} payrolls found`);
    } catch (error) {
      console.log(`  ⚠️  Payroll model not found (will be created when app starts): ${error.message}`);
    }
    
    console.log('\n🎉 Database verification completed successfully!');
    
  } catch (error) {
    console.error('❌ Database verification failed:', error);
    process.exit(1);
  } finally {
    // Close connection
    await mongoose.disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run verification
verifyDatabase(); 