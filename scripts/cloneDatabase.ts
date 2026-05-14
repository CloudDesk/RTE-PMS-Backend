import 'dotenv/config';
import mongoose from 'mongoose';

const OLD_DB_URI: string = 'mongodb+srv://non-prod:K6AeK5VkhrpOBAlU@cluster0.0ktur.mongodb.net/zuno-hr-india?retryWrites=true&w=majority&appName=Cluster0';
const NEW_DB_URI: string = 'mongodb+srv://user:Maples7@cluster0.q5p99zw.mongodb.net/rte_sit?appName=Cluster0';
const CLEAR_TARGET = process.env.CLONE_CLEAR_TARGET === 'true';
const BATCH_SIZE = Math.max(1, Number(process.env.CLONE_BATCH_SIZE || 1000));
const BATCH_DELAY_MS = Math.max(0, Number(process.env.CLONE_BATCH_DELAY_MS || 100));

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

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDatabaseName(uri: string): string {
    const withoutQuery = uri.split('?')[0];
    const segments = withoutQuery.split('/');
    return segments[segments.length - 1] || 'unknown';
}

function maskMongoUri(uri: string): string {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

function getRequiredConfig(): { oldDbUri: string; newDbUri: string } {
    if (OLD_DB_URI === NEW_DB_URI) {
        throw new Error('Source and target database URIs are identical. Aborting to prevent data loss.');
    }

    return {
        oldDbUri: OLD_DB_URI,
        newDbUri: NEW_DB_URI
    };
}

class DatabaseCloner {
    private stats: CloneStats[] = [];
    private totalStartTime: Date = new Date();

    async connectToDatabases(): Promise<void> {
        const { oldDbUri, newDbUri } = getRequiredConfig();

        console.log('Connecting to databases...');
        console.log(`  Source DB: ${getDatabaseName(oldDbUri)} (${maskMongoUri(oldDbUri)})`);
        console.log(`  Target DB: ${getDatabaseName(newDbUri)} (${maskMongoUri(newDbUri)})`);
        console.log(`  Clear target collections: ${CLEAR_TARGET ? 'YES' : 'NO'}`);
        console.log(`  Batch size: ${BATCH_SIZE}`);
        console.log(`  Batch delay: ${BATCH_DELAY_MS}ms`);

        try {
            oldConnection = mongoose.createConnection(oldDbUri);
            await oldConnection.asPromise();
            console.log(`Connected to SOURCE database (${getDatabaseName(oldDbUri)})`);

            newConnection = mongoose.createConnection(newDbUri);
            await newConnection.asPromise();
            console.log(`Connected to TARGET database (${getDatabaseName(newDbUri)})`);
        } catch (error) {
            console.error('Database connection failed:', error);
            throw error;
        }
    }

    async getAllCollections(): Promise<string[]> {
        try {
            const collections = await oldConnection.db.listCollections().toArray();
            const collectionNames = collections.map((col) => col.name);

            console.log(`Found ${collectionNames.length} collections:`);
            collectionNames.forEach((name) => console.log(`  - ${name}`));

            return collectionNames;
        } catch (error) {
            console.error('Failed to get collections:', error);
            throw error;
        }
    }

    private async flushBatch(
        collectionName: string,
        newCollection: mongoose.mongo.Collection,
        documents: any[],
        batchNumber: number,
        stats: CloneStats
    ): Promise<void> {
        if (documents.length === 0) {
            return;
        }

        try {
            const result = await newCollection.insertMany(documents, {
                ordered: false,
                writeConcern: { w: 'majority' }
            });

            stats.clonedDocuments += result.insertedCount;
            console.log(`  Batch ${batchNumber} for ${collectionName}: ${result.insertedCount}/${documents.length} inserted`);
        } catch (batchError: any) {
            const writeErrors = Array.isArray(batchError?.writeErrors) ? batchError.writeErrors.length : 0;
            const insertedCount = Number(batchError?.result?.insertedCount ?? batchError?.insertedCount ?? 0);
            const failedCount = Math.max(documents.length - insertedCount, writeErrors);

            stats.clonedDocuments += insertedCount;
            stats.errors += failedCount;

            if (batchError?.code === 11000 || writeErrors > 0) {
                console.warn(
                    `  Batch ${batchNumber} for ${collectionName}: partial insert (${insertedCount}/${documents.length}), failed=${failedCount}`
                );
                return;
            }

            console.error(`  Batch ${batchNumber} for ${collectionName} failed:`, batchError.message);
            throw batchError;
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
            console.log(`\nCloning collection: ${collectionName}`);

            const oldCollection = oldConnection.db.collection(collectionName);
            const newCollection = newConnection.db.collection(collectionName);

            stats.totalDocuments = await oldCollection.countDocuments();
            console.log(`  Total documents: ${stats.totalDocuments}`);

            if (stats.totalDocuments === 0) {
                console.log(`  Collection ${collectionName} is empty, skipping`);
                stats.endTime = new Date();
                return stats;
            }

            if (CLEAR_TARGET) {
                console.log('  Clearing existing data in target collection...');
                await newCollection.deleteMany({});
            }

            let processed = 0;
            let batchNumber = 1;
            let batch: any[] = [];
            const cursor = oldCollection.find({}).sort({ _id: 1 }).batchSize(BATCH_SIZE);

            for await (const document of cursor as any) {
                batch.push(document);

                if (batch.length === BATCH_SIZE) {
                    console.log(`  Processing batch ${batchNumber} (${processed + 1}-${processed + batch.length})`);
                    await this.flushBatch(collectionName, newCollection, batch, batchNumber, stats);
                    processed += batch.length;
                    batch = [];
                    batchNumber += 1;

                    if (BATCH_DELAY_MS > 0) {
                        await wait(BATCH_DELAY_MS);
                    }
                }
            }

            if (batch.length > 0) {
                console.log(`  Processing batch ${batchNumber} (${processed + 1}-${processed + batch.length})`);
                await this.flushBatch(collectionName, newCollection, batch, batchNumber, stats);
                processed += batch.length;
            }

            stats.endTime = new Date();
            const duration = stats.endTime.getTime() - stats.startTime.getTime();

            console.log(`  Collection ${collectionName} completed`);
            console.log(`    Total: ${stats.totalDocuments}`);
            console.log(`    Cloned: ${stats.clonedDocuments}`);
            console.log(`    Errors: ${stats.errors}`);
            console.log(`    Duration: ${(duration / 1000).toFixed(2)}s`);
        } catch (error) {
            console.error(`Failed to clone collection ${collectionName}:`, error);
            stats.errors = Math.max(stats.errors, stats.totalDocuments - stats.clonedDocuments);
            stats.endTime = new Date();
        }

        return stats;
    }

    async cloneAllCollections(): Promise<CloneResult> {
        try {
            console.log('Starting database cloning process...\n');

            const collections = await this.getAllCollections();

            for (const collectionName of collections) {
                const stats = await this.cloneCollection(collectionName);
                this.stats.push(stats);
            }

            const endTime = new Date();
            const totalDuration = endTime.getTime() - this.totalStartTime.getTime();
            const totalErrors = this.stats.reduce((sum, stat) => sum + stat.errors, 0);

            return {
                success: totalErrors === 0,
                stats: this.stats,
                totalCollections: collections.length,
                totalDocuments: this.stats.reduce((sum, stat) => sum + stat.totalDocuments, 0),
                totalCloned: this.stats.reduce((sum, stat) => sum + stat.clonedDocuments, 0),
                totalErrors,
                duration: totalDuration
            };
        } catch (error) {
            console.error('Database cloning failed:', error);
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
                console.log('Disconnected from SOURCE database');
            }
            if (newConnection) {
                await newConnection.close();
                console.log('Disconnected from TARGET database');
            }
        } catch (error) {
            console.error('Error disconnecting:', error);
        }
    }

    printSummary(result: CloneResult): void {
        console.log('\n' + '='.repeat(60));
        console.log('CLONING SUMMARY');
        console.log('='.repeat(60));
        console.log(`Success: ${result.success ? 'YES' : 'NO'}`);
        console.log(`Total Collections: ${result.totalCollections}`);
        console.log(`Total Documents: ${result.totalDocuments}`);
        console.log(`Cloned Documents: ${result.totalCloned}`);
        console.log(`Errors: ${result.totalErrors}`);
        console.log(`Total Duration: ${(result.duration / 1000).toFixed(2)}s`);

        console.log('\nCollection Details:');
        console.log('-'.repeat(60));
        result.stats.forEach((stat) => {
            const duration = stat.endTime
                ? ((stat.endTime.getTime() - stat.startTime.getTime()) / 1000).toFixed(2)
                : 'N/A';
            console.log(
                `${stat.collection.padEnd(30)} | ${stat.totalDocuments.toString().padStart(6)} | ${stat.clonedDocuments
                    .toString()
                    .padStart(6)} | ${stat.errors.toString().padStart(6)} | ${duration}s`
            );
        });

        console.log('='.repeat(60));
    }
}

let cloner: DatabaseCloner | null = null;

async function main() {
    cloner = new DatabaseCloner();
    let exitCode = 0;

    try {
        await cloner.connectToDatabases();
        const result = await cloner.cloneAllCollections();
        cloner.printSummary(result);

        if (result.success) {
            console.log('\nDatabase cloning completed successfully');
        } else {
            console.log('\nDatabase cloning completed with errors');
            exitCode = 1;
        }
    } catch (error) {
        console.error('Fatal error:', error);
        exitCode = 1;
    } finally {
        if (cloner) {
            await cloner.disconnect();
        }
        process.exit(exitCode);
    }
}

process.on('SIGINT', async () => {
    console.log('\nProcess interrupted. Cleaning up...');
    if (cloner) {
        await cloner.disconnect();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nProcess terminated. Cleaning up...');
    if (cloner) {
        await cloner.disconnect();
    }
    process.exit(0);
});

if (require.main === module) {
    main().catch(console.error);
}

export { DatabaseCloner };
