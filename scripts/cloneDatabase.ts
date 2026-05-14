import mongoose from 'mongoose';

// Database connection strings
const OLD_DB_URI = 'mongodb+srv://sachioncloud:Maples7123456789@cluster0.0ktur.mongodb.net/hrms_production?retryWrites=true&w=majority&appName=Cluster0';
const NEW_DB_URI = 'mongodb+srv://sachioncloud:Maples7123456789@cluster0.0ktur.mongodb.net/zuno-hr-india?retryWrites=true&w=majority&appName=Cluster0';

// Connection instances
let oldConnection: mongoose.Connection;
let newConnection: mongoose.Connection;

interface CloneStats {
    collection: string;
    totalDocuments: number;
    clonedDocuments: number;
    errors: number;
    startTime: Date;
    endTime?: Date;
}

interface CloneResult {
    success: boolean;
    stats: CloneStats[];
    totalCollections: number;
    totalDocuments: number;
    totalCloned: number;
    totalErrors: number;
    duration: number;
}

class DatabaseCloner {
    private stats: CloneStats[] = [];
    private totalStartTime: Date = new Date();

    async connectToDatabases(): Promise<void> {
        console.log('🔌 Connecting to databases...');

        try {
            // Connect to old database
            oldConnection = mongoose.createConnection(OLD_DB_URI);
            await new Promise((resolve, reject) => {
                oldConnection.once('connected', () => {
                    console.log('✅ Connected to OLD database (hrms_production)');
                    resolve(true);
                });
                oldConnection.once('error', (err) => reject(err));
            });

            // Connect to new database
            newConnection = mongoose.createConnection(NEW_DB_URI);
            await new Promise((resolve, reject) => {
                newConnection.once('connected', () => {
                    console.log('✅ Connected to NEW database (zuno-hr-india)');
                    resolve(true);
                });
                newConnection.once('error', (err) => reject(err));
            });

        } catch (error) {
            console.error('❌ Database connection failed:', error);
            throw error;
        }
    }

    async getAllCollections(): Promise<string[]> {
        try {
            const collections = await oldConnection.db.listCollections().toArray();
            const collectionNames = collections.map(col => col.name);

            console.log(`📋 Found ${collectionNames.length} collections:`);
            collectionNames.forEach(name => console.log(`   - ${name}`));

            return collectionNames;
        } catch (error) {
            console.error('❌ Failed to get collections:', error);
            throw error;
        }
    }

    async cloneCollection(collectionName: string): Promise<CloneStats> {
        const startTime = new Date();
        const stats: CloneStats = {
            collection: collectionName,
            totalDocuments: 0,
            clonedDocuments: 0,
            errors: 0,
            startTime
        };

        try {
            console.log(`\n🔄 Cloning collection: ${collectionName}`);

            // Get the collection from old database
            const oldCollection = oldConnection.db.collection(collectionName);
            const newCollection = newConnection.db.collection(collectionName);

            // Count total documents
            stats.totalDocuments = await oldCollection.countDocuments();
            console.log(`   📊 Total documents: ${stats.totalDocuments}`);

            if (stats.totalDocuments === 0) {
                console.log(`   ⚠️  Collection ${collectionName} is empty, skipping...`);
                stats.endTime = new Date();
                return stats;
            }

            // Clear existing data in new collection (optional - remove if you want to append)
            console.log(`   🗑️  Clearing existing data in new collection...`);
            await newCollection.deleteMany({});

            // Clone documents in batches
            const batchSize = 1000;
            let processed = 0;
            let batchNumber = 1;

            while (processed < stats.totalDocuments) {
                console.log(`   📦 Processing batch ${batchNumber} (${processed + 1}-${Math.min(processed + batchSize, stats.totalDocuments)})`);

                const documents = await oldCollection
                    .find({})
                    .skip(processed)
                    .limit(batchSize)
                    .toArray();

                if (documents.length === 0) break;

                try {
                    // Insert documents with same IDs
                    const result = await newCollection.insertMany(documents, {
                        ordered: false, // Continue on duplicate key errors
                        writeConcern: { w: 'majority' }
                    });

                    stats.clonedDocuments += result.insertedCount;
                    processed += documents.length;

                    console.log(`   ✅ Batch ${batchNumber}: ${result.insertedCount}/${documents.length} documents cloned`);

                } catch (batchError: any) {
                    // Handle batch errors (like duplicate keys)
                    if (batchError.code === 11000) {
                        console.log(`   ⚠️  Batch ${batchNumber}: Some documents already exist (duplicate keys)`);
                        stats.clonedDocuments += documents.length; // Assume all were "cloned" if they already exist
                    } else {
                        console.error(`   ❌ Batch ${batchNumber} error:`, batchError.message);
                        stats.errors += documents.length;
                    }
                    processed += documents.length;
                }

                batchNumber++;

                // Small delay to prevent overwhelming the database
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            stats.endTime = new Date();
            const duration = stats.endTime.getTime() - stats.startTime.getTime();

            console.log(`   ✅ Collection ${collectionName} completed:`);
            console.log(`      📊 Total: ${stats.totalDocuments}`);
            console.log(`      ✅ Cloned: ${stats.clonedDocuments}`);
            console.log(`      ❌ Errors: ${stats.errors}`);
            console.log(`      ⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);

        } catch (error) {
            console.error(`❌ Failed to clone collection ${collectionName}:`, error);
            stats.errors = stats.totalDocuments; // Mark all as errors
            stats.endTime = new Date();
        }

        return stats;
    }

    async cloneAllCollections(): Promise<CloneResult> {
        try {
            console.log('🚀 Starting database cloning process...\n');

            const collections = await this.getAllCollections();

            for (const collectionName of collections) {
                const stats = await this.cloneCollection(collectionName);
                this.stats.push(stats);
            }

            const endTime = new Date();
            const totalDuration = endTime.getTime() - this.totalStartTime.getTime();

            const result: CloneResult = {
                success: true,
                stats: this.stats,
                totalCollections: collections.length,
                totalDocuments: this.stats.reduce((sum, stat) => sum + stat.totalDocuments, 0),
                totalCloned: this.stats.reduce((sum, stat) => sum + stat.clonedDocuments, 0),
                totalErrors: this.stats.reduce((sum, stat) => sum + stat.errors, 0),
                duration: totalDuration
            };

            return result;

        } catch (error) {
            console.error('❌ Database cloning failed:', error);
            return {
                success: false,
                stats: this.stats,
                totalCollections: 0,
                totalDocuments: 0,
                totalCloned: 0,
                totalErrors: 0,
                duration: 0
            };
        }
    }

    async disconnect(): Promise<void> {
        try {
            if (oldConnection) {
                await oldConnection.close();
                console.log('🔌 Disconnected from OLD database');
            }
            if (newConnection) {
                await newConnection.close();
                console.log('🔌 Disconnected from NEW database');
            }
        } catch (error) {
            console.error('❌ Error disconnecting:', error);
        }
    }

    printSummary(result: CloneResult): void {
        console.log('\n' + '='.repeat(60));
        console.log('📊 CLONING SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ Success: ${result.success ? 'YES' : 'NO'}`);
        console.log(`📁 Total Collections: ${result.totalCollections}`);
        console.log(`📄 Total Documents: ${result.totalDocuments}`);
        console.log(`✅ Cloned Documents: ${result.totalCloned}`);
        console.log(`❌ Errors: ${result.totalErrors}`);
        console.log(`⏱️  Total Duration: ${(result.duration / 1000).toFixed(2)}s`);

        console.log('\n📋 Collection Details:');
        console.log('-'.repeat(60));
        result.stats.forEach(stat => {
            const duration = stat.endTime ?
                ((stat.endTime.getTime() - stat.startTime.getTime()) / 1000).toFixed(2) : 'N/A';
            console.log(`${stat.collection.padEnd(30)} | ${stat.totalDocuments.toString().padStart(6)} | ${stat.clonedDocuments.toString().padStart(6)} | ${stat.errors.toString().padStart(6)} | ${duration}s`);
        });

        console.log('='.repeat(60));
    }
}

// Global cloner instance for process handlers
let cloner: DatabaseCloner | null = null;

// Main execution function
async function main() {
    cloner = new DatabaseCloner();

    try {
        await cloner.connectToDatabases();
        const result = await cloner.cloneAllCollections();
        cloner.printSummary(result);

        if (result.success) {
            console.log('\n🎉 Database cloning completed successfully!');
            process.exit(0);
        } else {
            console.log('\n❌ Database cloning failed!');
            process.exit(1);
        }

    } catch (error) {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    } finally {
        if (cloner) {
            await cloner.disconnect();
        }
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n⚠️  Process interrupted. Cleaning up...');
    if (cloner) {
        await cloner.disconnect();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n⚠️  Process terminated. Cleaning up...');
    if (cloner) {
        await cloner.disconnect();
    }
    process.exit(0);
});

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

export { DatabaseCloner };
