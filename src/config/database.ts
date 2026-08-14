import mongoose from 'mongoose';
import { config } from './index';

const DB_CONNECT_MAX_RETRIES = Math.max(
  1,
  Number(process.env.DB_CONNECT_MAX_RETRIES || 3),
);
const DB_CONNECT_RETRY_DELAY_MS = Math.max(
  1000,
  Number(process.env.DB_CONNECT_RETRY_DELAY_MS || 2000),
);
const DB_SERVER_SELECTION_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.DB_SERVER_SELECTION_TIMEOUT_MS || 30000),
);
const DB_CONNECT_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
);
const DB_SOCKET_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.DB_SOCKET_TIMEOUT_MS || 45000),
);
// Pool sizing is per replica. With Container Apps scaling to N replicas the
// cluster sees up to N * DB_MAX_POOL_SIZE connections, so keep the ceiling well
// under the cluster's connection limit.
const DB_MAX_POOL_SIZE = Math.max(1, Number(process.env.DB_MAX_POOL_SIZE || 50));
// A warm floor means a scaled-out replica does not pay TCP + TLS + SCRAM on its
// first requests, which is where the burst latency was coming from.
const DB_MIN_POOL_SIZE = Math.max(0, Number(process.env.DB_MIN_POOL_SIZE || 10));
// Long enough that a lull between bursts does not reap the warm pool.
const DB_MAX_IDLE_TIME_MS = Math.max(0, Number(process.env.DB_MAX_IDLE_TIME_MS || 600000));
// Index creation belongs to deploy (npm run db:migrate:startup), not to boot.
// Leaving this on makes every replica issue createIndexes for ~182 declared
// indexes while it is also trying to serve the traffic that triggered scale-out.
const DB_AUTO_INDEX = process.env.DB_AUTO_INDEX
  ? process.env.DB_AUTO_INDEX === 'true'
  : process.env.NODE_ENV !== 'production';

let connectionListenersRegistered = false;
let connectionPromise: Promise<void> | null = null;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerConnectionListeners(): void {
  if (connectionListenersRegistered) {
    return;
  }

  mongoose.connection.on('error', (err) => {
    console.error('[DB] MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected.');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[DB] MongoDB reconnected');
  });

  connectionListenersRegistered = true;
}

/**
 * One-time migration: drop old global unique index on users.email so duplicate email
 * (allowDuplicateEmail) can work. Only drops the index; no user data is deleted.
 * Safe to run on live DB: existing documents are unchanged.
 */
async function migrateEmailIndexIfNeeded(): Promise<void> {
  try {
    const coll = mongoose.connection.collection('users');
    const indexes = await coll.indexes();
    const emailIndex = (indexes as { name: string }[]).find((i) => i.name === 'email_1');
    if (!emailIndex) return;
    // Drop only the old global unique index; partial index is created by User model
    await coll.dropIndex('email_1');
    console.log('[DB] Dropped old email_1 index; app will use partial unique index (portalAccess: true). No data removed.');
  } catch (err: any) {
    if (err.codeName === 'IndexNotFound' || err.message?.includes('index not found')) return;
    console.warn('[DB] migrateEmailIndexIfNeeded:', err.message);
  }
}

/**
 * One-time data correction: fixes templates that are marked 'ACTIVE' but have no active version.
 * Updates their status to 'DRAFT' to maintain integrity.
 */
async function migrateTemplateStatusesIfNeeded(): Promise<void> {
  try {
    const coll = mongoose.connection.collection('pms_templates');
    const query = {
      status: 'ACTIVE',
      $or: [
        { currentVersionId: { $exists: false } },
        { currentVersionId: null }
      ]
    };
    const mismatchedTemplates = await coll.find(query).toArray();

    if (mismatchedTemplates.length > 0) {
      console.log(`[DB] Found ${mismatchedTemplates.length} mismatched templates with Active status but no active version. Correcting to DRAFT...`);
      await coll.updateMany(
        query,
        { $set: { status: 'DRAFT' } }
      );
      console.log('[DB] Corrected mismatched template statuses successfully.');
    }
  } catch (err: any) {
    console.warn('[DB] migrateTemplateStatusesIfNeeded failed:', err.message);
  }
}

/** Consolidate legacy per-term achievement documents into one active annual document. */
async function migrateEmployeeAchievementSubmissionIndexesIfNeeded(): Promise<void> {
  try {
    const coll = mongoose.connection.collection('employee_achievement_submissions');
    await coll.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } },
    );

    const duplicateAnnualAssignments = await coll.aggregate<{
      _id: mongoose.Types.ObjectId;
      ids: mongoose.Types.ObjectId[];
    }>([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$annualAssignmentId',
          ids: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]).toArray();

    for (const duplicate of duplicateAnnualAssignments) {
      const documents = await coll.find({ _id: { $in: duplicate.ids } })
        .sort({ createdAt: 1, _id: 1 })
        .toArray();
      const keeper = documents[0];
      const latest = documents[documents.length - 1];
      if (!keeper || !latest) continue;

      const itemByIdentity = new Map<string, Record<string, unknown>>();
      const valueByIdentity = new Map<string, Record<string, unknown>>();
      for (const document of documents) {
        for (const item of document.achievementItems ?? []) {
          const objectiveId = item.objectiveId?.toString?.();
          const identity = objectiveId
            ? `OBJECTIVE:${objectiveId}`
            : `ADDITIONAL:${JSON.stringify(item)}`;
          itemByIdentity.set(identity, item);
        }
        for (const value of document.achievementValues ?? []) {
          valueByIdentity.set(`${value.sectionKey ?? ''}:${value.fieldKey ?? ''}`, value);
        }
      }
      const mergedAchievementItems = Array.from(itemByIdentity.values());
      const mergedAchievementValues = Array.from(valueByIdentity.values()).map((value) =>
        value.fieldKey === 'achievement_items'
          ? { ...value, valueJson: mergedAchievementItems }
          : value,
      );

      await coll.updateOne(
        { _id: keeper._id },
        {
          $set: {
            achievementItems: mergedAchievementItems,
            achievementValues: mergedAchievementValues,
            status: latest.status,
            draftSavedAt: latest.draftSavedAt,
            submittedBy: latest.submittedBy,
            submittedAt: latest.submittedAt,
            lockedAt: latest.lockedAt,
            auditMetadata: latest.auditMetadata,
            updatedBy: latest.updatedBy,
            updatedAt: latest.updatedAt,
          },
        },
      );
      await coll.updateMany(
        { _id: { $in: documents.slice(1).map((document) => document._id) } },
        { $set: { isDeleted: true, updatedAt: new Date() } },
      );
    }

    const indexes = await coll.indexes();
    const obsoleteIndexes = (
      indexes as Array<{ name: string; key?: Record<string, number>; unique?: boolean }>
    ).filter((index) => (
      index.name === 'idx_employee_achievement_submission_quarter_assignment' ||
      index.name === 'idx_employee_achievement_submission_term_assignment' ||
      index.name === 'annualAssignmentId_1' ||
      (index.unique === true && Object.keys(index.key ?? {}).length === 1 &&
        (index.key?.quarterAssignmentId === 1 || index.key?.termAssignmentId === 1))
    ));

    for (const index of obsoleteIndexes) {
      await coll.dropIndex(index.name);
    }

    await coll.createIndex(
      { annualAssignmentId: 1 },
      {
        unique: true,
        name: 'idx_employee_achievement_submission_annual_assignment',
        partialFilterExpression: { isDeleted: false },
      },
    );
    console.log('[DB] Employee achievements now use one active submission per annual assignment.');
  } catch (err: any) {
    if (err.codeName === 'IndexNotFound' || err.message?.includes('index not found')) return;
    console.warn('[DB] migrateEmployeeAchievementSubmissionIndexesIfNeeded failed:', err.message);
  }
}

/**
 * Career profile employee codes are now stored upper-cased, with a plain unique
 * index instead of one carrying a collation — Cosmos DB for MongoDB rejects
 * createIndex.collation ("not implemented yet"), which failed the index build.
 *
 * Normalises any legacy mixed-case values, then drops the old collation index so
 * the index sync can recreate it without one. Aborts loudly if normalising would
 * collide two existing profiles, rather than letting the unique build fail later
 * with a less obvious error.
 */
async function migrateCareerProfileEmployeeCodeIndex(): Promise<void> {
  const INDEX_NAME = 'uq_pms_employee_career_profile_employee_code';
  const coll = mongoose.connection.collection('pms_employee_career_profiles');

  const documents = await coll
    .find({}, { projection: { employeeCode: 1 } })
    .toArray();

  const needsNormalising = documents.filter((document) => {
    const code = String(document.employeeCode ?? '');
    return code !== code.trim().toUpperCase();
  });

  if (needsNormalising.length > 0) {
    const seen = new Map<string, unknown>();
    const collisions: string[] = [];
    for (const document of documents) {
      const key = String(document.employeeCode ?? '').trim().toUpperCase();
      if (seen.has(key)) {
        collisions.push(key);
      } else {
        seen.set(key, document._id);
      }
    }
    if (collisions.length > 0) {
      throw new Error(
        `Cannot normalise career profile employeeCode: upper-casing would create duplicates for [${[
          ...new Set(collisions),
        ].join(', ')}]. Resolve these profiles before deploying.`,
      );
    }

    for (const document of needsNormalising) {
      await coll.updateOne(
        { _id: document._id },
        { $set: { employeeCode: String(document.employeeCode ?? '').trim().toUpperCase() } },
      );
    }
    console.log(
      `[DB] Normalised ${needsNormalising.length} career profile employeeCode value(s) to upper case.`,
    );
  }

  const indexes = (await coll.indexes()) as Array<{ name: string; collation?: unknown }>;
  const legacy = indexes.find((index) => index.name === INDEX_NAME && index.collation);
  if (legacy) {
    await coll.dropIndex(INDEX_NAME);
    console.log(`[DB] Dropped legacy collation index ${INDEX_NAME}; it will be rebuilt without one.`);
  }
}

/**
 * One-shot data/index migrations. Previously these ran inside connectDB on every
 * process start, so every Container Apps replica re-ran them — including on
 * scale-out under peak load. They are now invoked from the deploy step only
 * (npm run db:migrate:startup).
 */
export async function runStartupMigrations(): Promise<void> {
  await migrateEmailIndexIfNeeded();
  await migrateTemplateStatusesIfNeeded();
  await migrateEmployeeAchievementSubmissionIndexesIfNeeded();
  await migrateCareerProfileEmployeeCodeIndex();
}

export const connectDB = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    let lastError: unknown;
    const startedAt = Date.now();

    for (let attempt = 1; attempt <= DB_CONNECT_MAX_RETRIES; attempt += 1) {
      try {
        console.log(
          `[DB] Connecting to MongoDB (attempt ${attempt}/${DB_CONNECT_MAX_RETRIES}, serverSelectionTimeoutMS=${DB_SERVER_SELECTION_TIMEOUT_MS}, connectTimeoutMS=${DB_CONNECT_TIMEOUT_MS}, maxPoolSize=${DB_MAX_POOL_SIZE}, minPoolSize=${DB_MIN_POOL_SIZE}, autoIndex=${DB_AUTO_INDEX})...`,
        );
        await mongoose.connect(config.mongoUri, {
          serverSelectionTimeoutMS: DB_SERVER_SELECTION_TIMEOUT_MS,
          connectTimeoutMS: DB_CONNECT_TIMEOUT_MS,
          socketTimeoutMS: DB_SOCKET_TIMEOUT_MS,
          maxPoolSize: DB_MAX_POOL_SIZE,
          minPoolSize: DB_MIN_POOL_SIZE,
          maxIdleTimeMS: DB_MAX_IDLE_TIME_MS,
          autoIndex: DB_AUTO_INDEX,
          autoCreate: DB_AUTO_INDEX,
        });
        console.log(
          `[DB] MongoDB connected successfully in ${Date.now() - startedAt}ms`,
        );

        // Migrations deliberately do NOT run here. They are writes, and running
        // them on every replica boot means a scale-out event fires DDL and
        // updateMany at the database exactly when it is busiest.
        // Run them from deploy instead: npm run db:migrate:startup

        try {
          const { accessService } = await import('../services/access.service');
          await accessService.initialize();
        } catch (initErr) {
          console.error('[DB] Failed to initialize AccessService', initErr);
        }

        registerConnectionListeners();

        return;
      } catch (error) {
        lastError = error;
        console.error(
          `[DB] MongoDB connection attempt ${attempt} failed:`,
          error,
        );

        if (attempt < DB_CONNECT_MAX_RETRIES) {
          console.warn(
            `[DB] Retrying MongoDB connection in ${DB_CONNECT_RETRY_DELAY_MS}ms...`,
          );
          await wait(DB_CONNECT_RETRY_DELAY_MS);
        }
      }
    }

    throw new Error(
      `[DB] Failed to connect to MongoDB after ${DB_CONNECT_MAX_RETRIES} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  })();

  try {
    await connectionPromise;
  } finally {
    connectionPromise = null;
  }
};

export function getDatabaseHealth() {
  const stateMap: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  return {
    ready: mongoose.connection.readyState === 1,
    state: stateMap[mongoose.connection.readyState] || 'unknown',
  };
}

export function startDBConnection(): void {
  if (mongoose.connection.readyState === 1 || connectionPromise) {
    return;
  }

  void connectDB().catch((error) => {
    console.error('[DB] Background MongoDB connection failed:', error);
  });
}
