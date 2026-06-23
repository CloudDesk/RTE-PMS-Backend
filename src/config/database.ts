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
  Number(process.env.DB_SERVER_SELECTION_TIMEOUT_MS || 5000),
);
const DB_CONNECT_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
);
const DB_SOCKET_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.DB_SOCKET_TIMEOUT_MS || 45000),
);

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

/**
 * One-time migration: PMS achievement submissions moved from legacy
 * quarterAssignmentId to termAssignmentId. Drop the old unique index because
 * new term-based documents do not set quarterAssignmentId, causing duplicate
 * key errors on { quarterAssignmentId: null }.
 */
async function migrateEmployeeAchievementSubmissionIndexesIfNeeded(): Promise<void> {
  try {
    const coll = mongoose.connection.collection('employee_achievement_submissions');
    const indexes = await coll.indexes();
    const legacyIndex = (
      indexes as Array<{ name: string; key?: Record<string, number>; unique?: boolean }>
    ).find((index) => (
      index.name === 'idx_employee_achievement_submission_quarter_assignment' ||
      (index.unique === true &&
        Object.keys(index.key ?? {}).length === 1 &&
        index.key?.quarterAssignmentId === 1)
    ));

    if (!legacyIndex) return;

    await coll.dropIndex(legacyIndex.name);
    console.log(
      `[DB] Dropped old employee achievement quarterAssignmentId index "${legacyIndex.name}"; app uses termAssignmentId now. No data removed.`,
    );
  } catch (err: any) {
    if (err.codeName === 'IndexNotFound' || err.message?.includes('index not found')) return;
    console.warn('[DB] migrateEmployeeAchievementSubmissionIndexesIfNeeded failed:', err.message);
  }
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
          `[DB] Connecting to MongoDB (attempt ${attempt}/${DB_CONNECT_MAX_RETRIES}, serverSelectionTimeoutMS=${DB_SERVER_SELECTION_TIMEOUT_MS}, connectTimeoutMS=${DB_CONNECT_TIMEOUT_MS})...`,
        );
        await mongoose.connect(config.mongoUri, {
          serverSelectionTimeoutMS: DB_SERVER_SELECTION_TIMEOUT_MS,
          connectTimeoutMS: DB_CONNECT_TIMEOUT_MS,
          socketTimeoutMS: DB_SOCKET_TIMEOUT_MS,
        });
        console.log(
          `[DB] MongoDB connected successfully in ${Date.now() - startedAt}ms`,
        );

        await migrateEmailIndexIfNeeded();
        await migrateTemplateStatusesIfNeeded();
        await migrateEmployeeAchievementSubmissionIndexesIfNeeded();
        
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
