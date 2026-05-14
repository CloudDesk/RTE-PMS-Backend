import { connect, disconnect } from 'mongoose';
import { User } from '../src/models/user.model';

async function migrateUserSchema() {
  try {
    // Use the same MongoDB URI as the main application
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sachioncloud:Maples7123456789@cluster0.0ktur.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    console.log('Attempting to connect to MongoDB at:', mongoUri);
    
    await connect(mongoUri);
    console.log('✅ Connected to MongoDB successfully');

    // Check if there are any users to migrate
    const totalUsers = await User.countDocuments();
    console.log(`📊 Total users found: ${totalUsers}`);

    if (totalUsers === 0) {
      console.log('ℹ️  No users found to migrate. Migration completed.');
      return;
    }

    // Count users that need migration (missing any of the new fields)
    const usersNeedingMigration = await User.countDocuments({
      $or: [
        { country: { $exists: false } },
        { currency: { $exists: false } },
        { licenseType: { $exists: false } },
        { portalAccess: { $exists: false } }
      ]
    });

    console.log(`📋 Users needing migration: ${usersNeedingMigration}`);

    if (usersNeedingMigration === 0) {
      console.log('✅ All users already have the new schema fields. Migration not needed.');
      return;
    }

    // Update all existing users to have the new fields with default values
    const result = await User.updateMany(
      {
        $or: [
          { country: { $exists: false } },
          { currency: { $exists: false } },
          { licenseType: { $exists: false } },
          { portalAccess: { $exists: false } }
        ]
      },
      {
        $set: {
          country: 'IN',
          currency: 'INR',
          licenseType: 'employee',
          portalAccess: true
        }
      }
    );

    console.log(`✅ Successfully updated ${result.modifiedCount} users with new schema fields`);

    // Verify the migration
    const usersWithNewFields = await User.countDocuments({
      country: { $exists: true },
      currency: { $exists: true },
      licenseType: { $exists: true },
      portalAccess: { $exists: true }
    });

    console.log(`📊 Verification: ${usersWithNewFields}/${totalUsers} users now have new fields`);

    if (totalUsers === usersWithNewFields) {
      console.log('🎉 Migration completed successfully!');
    } else {
      console.log('⚠️  Some users may not have been updated. Please check manually.');
    }

    // Show sample of updated users
    const sampleUsers = await User.find({}, { name: 1, email: 1, country: 1, currency: 1, licenseType: 1, portalAccess: 1 }).limit(5);
    console.log('\n📋 Sample of updated users:');
    sampleUsers.forEach(user => {
      console.log(`  - ${user.name} (${user.email}): ${user.country}/${user.currency}/${user.licenseType}/${user.portalAccess}`);
    });

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Troubleshooting tips:');
      console.log('1. Make sure MongoDB is running');
      console.log('2. Check if the MongoDB URI is correct');
      console.log('3. If using a remote database, ensure network connectivity');
      console.log('4. Try running: brew services start mongodb-community (on macOS)');
      console.log('5. Or start MongoDB manually: mongod');
    }
  } finally {
    try {
      await disconnect();
      console.log('🔌 Disconnected from MongoDB');
    } catch (error) {
      console.log('⚠️  Error disconnecting from MongoDB:', error);
    }
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  console.log('🚀 Starting User Schema Migration...\n');
  migrateUserSchema();
}

export { migrateUserSchema }; 