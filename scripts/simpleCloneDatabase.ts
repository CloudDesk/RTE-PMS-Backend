import mongoose from 'mongoose';

// Database connection strings
const OLD_DB_URI = 'mongodb+srv://sachioncloud:Maples7123456789@cluster0.0ktur.mongodb.net/hrms_production?retryWrites=true&w=majority&appName=Cluster0';
const NEW_DB_URI = 'mongodb+srv://sachioncloud:Maples7123456789@cluster0.0ktur.mongodb.net/zuno-hr-india?retryWrites=true&w=majority&appName=Cluster0';

async function cloneDatabase() {
    let oldConnection: mongoose.Connection | undefined;
    let newConnection: mongoose.Connection | undefined;

    try {
        console.log('🔌 Connecting to databases...');

        // Connect to both databases
        oldConnection = await mongoose.createConnection(OLD_DB_URI);
        newConnection = await mongoose.createConnection(NEW_DB_URI);

        console.log('✅ Connected to both databases');
        console.log('🔍 Old connection ready state:', oldConnection.readyState);
        console.log('🔍 New connection ready state:', newConnection.readyState);

        // Wait a moment for connections to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get all collections from old database
        const collections = await oldConnection.db.listCollections().toArray();
        console.log(`📋 Found ${collections.length} collections to clone`);

        let totalDocuments = 0;
        let totalCloned = 0;

        // Clone each collection
        for (const collectionInfo of collections) {
            const collectionName = collectionInfo.name;
            console.log(`\n🔄 Cloning collection: ${collectionName}`);

            const oldCollection = oldConnection.db.collection(collectionName);
            const newCollection = newConnection.db.collection(collectionName);

            // Count documents
            const docCount = await oldCollection.countDocuments();
            totalDocuments += docCount;
            console.log(`   📊 Documents to clone: ${docCount}`);

            if (docCount === 0) {
                console.log(`   ⚠️  Collection is empty, skipping...`);
                continue;
            }

            // Clear new collection first
            await newCollection.deleteMany({});
            console.log(`   🗑️  Cleared existing data in new collection`);

            // Clone all documents
            const documents = await oldCollection.find({}).toArray();

            if (documents.length > 0) {
                await newCollection.insertMany(documents);
                totalCloned += documents.length;
                console.log(`   ✅ Cloned ${documents.length} documents`);
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log('📊 CLONING COMPLETED');
        console.log('='.repeat(50));
        console.log(`📁 Collections: ${collections.length}`);
        console.log(`📄 Total Documents: ${totalDocuments}`);
        console.log(`✅ Cloned Documents: ${totalCloned}`);
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        // Close connections
        if (oldConnection) {
            await oldConnection.close();
            console.log('🔌 Disconnected from OLD database');
        }
        if (newConnection) {
            await newConnection.close();
            console.log('🔌 Disconnected from NEW database');
        }
    }
}

// Run the script
cloneDatabase().then(() => {
    console.log('🎉 Database cloning completed!');
    process.exit(0);
}).catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});