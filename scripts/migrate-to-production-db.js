const { MongoClient } = require('mongodb');
require('dotenv').config();

// Configuration
const SOURCE_URI =  'mongodb+srv://sachioncloud:Maples7123456789@cluster0.0ktur.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';
const TARGET_URI = 'mongodb+srv://sachioncloud:Maples7123456789@cluster0.0ktur.mongodb.net/hrms_production?retryWrites=true&w=majority&appName=Cluster0';

const SOURCE_DB = 'test';
const TARGET_DB = 'hrms_production';

// Collections to migrate (based on your Mongoose models)
const COLLECTIONS_TO_MIGRATE = [
  'users',
  'leaves',
  'payrolls',
  'attendance-records',
  'attendance-regularizations',
  'audit-logs',
  'data-units',
  'documents',
  'holiday-calendars',
  'leave-summaries',
  'lovs',
  'organizations',
  'overtimes',
  'payroll-deductions',
  'payroll-salary-structures',
  'payslips',
  'reports',
  'salary-assignments',
  'salary-structures',
  'shifts',
  'tax-declarations',
  'tax-slabs',
  'timesheet-files',
  'timesheets',
  'training-attendances',
  'trainings',
  'weekend-calendars'
];

async function migrateDatabase() {
  let sourceClient, targetClient;
  
  try {
    console.log('🚀 Starting database migration...');
    console.log(`📤 Source: ${SOURCE_DB}`);
    console.log(`📥 Target: ${TARGET_DB}`);
    
    // Connect to source database
    console.log('\n🔌 Connecting to source database...');
    sourceClient = new MongoClient(SOURCE_URI);
    await sourceClient.connect();
    const sourceDb = sourceClient.db(SOURCE_DB);
    
    // Connect to target database
    console.log('🔌 Connecting to target database...');
    targetClient = new MongoClient(TARGET_URI);
    await targetClient.connect();
    const targetDb = targetClient.db(TARGET_DB);
    
    console.log('✅ Both databases connected successfully!');
    
    // Get list of existing collections in source
    const existingCollections = await sourceDb.listCollections().toArray();
    const existingCollectionNames = existingCollections.map(col => col.name);
    
    console.log(`\n📋 Found ${existingCollectionNames.length} collections in source database:`);
    existingCollectionNames.forEach(name => console.log(`  - ${name}`));
    
    let totalDocumentsMigrated = 0;
    let collectionsMigrated = 0;
    
    // Migrate each collection
    for (const collectionName of existingCollectionNames) {
      try {
        console.log(`\n🔄 Migrating collection: ${collectionName}`);
        
        const sourceCollection = sourceDb.collection(collectionName);
        const targetCollection = targetDb.collection(collectionName);
        
        // Get document count
        const documentCount = await sourceCollection.countDocuments();
        console.log(`  📊 Found ${documentCount} documents`);
        
        if (documentCount === 0) {
          console.log(`  ⚠️  Collection ${collectionName} is empty, skipping...`);
          continue;
        }
        
        // Get all documents
        const documents = await sourceCollection.find({}).toArray();
        
        if (documents.length > 0) {
          // Insert documents into target collection
          const result = await targetCollection.insertMany(documents);
          console.log(`  ✅ Successfully migrated ${result.insertedCount} documents`);
          totalDocumentsMigrated += result.insertedCount;
          collectionsMigrated++;
        }
        
      } catch (error) {
        console.error(`  ❌ Error migrating collection ${collectionName}:`, error.message);
      }
    }
    
    console.log('\n🎉 Migration completed!');
    console.log(`📊 Summary:`);
    console.log(`  - Collections migrated: ${collectionsMigrated}`);
    console.log(`  - Total documents migrated: ${totalDocumentsMigrated}`);
    
    // Verify migration
    console.log('\n🔍 Verifying migration...');
    const targetCollections = await targetDb.listCollections().toArray();
    console.log(`📋 Collections in target database: ${targetCollections.length}`);
    
    for (const collection of targetCollections) {
      const count = await targetDb.collection(collection.name).countDocuments();
      console.log(`  - ${collection.name}: ${count} documents`);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close connections
    if (sourceClient) {
      await sourceClient.close();
      console.log('\n🔌 Source database connection closed');
    }
    if (targetClient) {
      await targetClient.close();
      console.log('🔌 Target database connection closed');
    }
  }
}

// Dry run function to check what would be migrated
async function dryRun() {
  let sourceClient;
  
  try {
    console.log('🔍 DRY RUN - Checking what would be migrated...');
    
    sourceClient = new MongoClient(SOURCE_URI);
    await sourceClient.connect();
    const sourceDb = sourceClient.db(SOURCE_DB);
    
    const existingCollections = await sourceDb.listCollections().toArray();
    
    console.log(`\n📋 Collections found in source database (${SOURCE_DB}):`);
    let totalDocuments = 0;
    
    for (const collection of existingCollections) {
      const count = await sourceDb.collection(collection.name).countDocuments();
      console.log(`  - ${collection.name}: ${count} documents`);
      totalDocuments += count;
    }
    
    console.log(`\n📊 Total documents to migrate: ${totalDocuments}`);
    console.log('💡 Run without --dry-run flag to perform actual migration');
    
  } catch (error) {
    console.error('❌ Dry run failed:', error);
  } finally {
    if (sourceClient) {
      await sourceClient.close();
    }
  }
}

// Main execution
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

if (isDryRun) {
  dryRun();
} else {
  migrateDatabase();
} 