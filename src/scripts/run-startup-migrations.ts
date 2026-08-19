/**
 * Deploy-time database step.
 *
 * Runs the one-shot migrations and builds schema indexes once, from a single
 * process, instead of on every API replica boot. The API now starts with
 * autoIndex disabled in production, so this script is what keeps indexes in
 * sync after a schema change — it must run on every deploy, before or just
 * after the new revision goes live.
 *
 *   npm run db:migrate:startup
 *
 * Index creation here is additive (createIndexes): it creates what is missing
 * and leaves everything else alone. It never drops an index.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { connectDB, runStartupMigrations } from '../config/database';
import '../models';

const INDEX_BUILD_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.DB_INDEX_BUILD_MAX_ATTEMPTS || 3),
);
const INDEX_BUILD_RETRY_DELAY_MS = Math.max(
  1000,
  Number(process.env.DB_INDEX_BUILD_RETRY_DELAY_MS || 5000),
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTransientCosmosIndexError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    /worker node connections have exceeded the limit/i.test(message) ||
    /unexpected internal error has occurred/i.test(message) ||
    /too many requests/i.test(message) ||
    /service unavailable/i.test(message)
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createModelIndexes(modelName: string): Promise<void> {
  for (let attempt = 1; attempt <= INDEX_BUILD_MAX_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.model(modelName).createIndexes();
      return;
    } catch (error) {
      const canRetry =
        isTransientCosmosIndexError(error) && attempt < INDEX_BUILD_MAX_ATTEMPTS;
      if (!canRetry) throw error;

      const delayMs = INDEX_BUILD_RETRY_DELAY_MS * attempt;
      console.warn(
        `[migrate] indexes transient failure: ${modelName} — ${errorMessage(error)}; ` +
          `retrying in ${delayMs}ms (${attempt + 1}/${INDEX_BUILD_MAX_ATTEMPTS})`,
      );
      await wait(delayMs);
    }
  }
}

async function buildIndexes(): Promise<number> {
  const modelNames = mongoose.modelNames().sort();
  let failed = 0;

  for (const modelName of modelNames) {
    const startedAt = Date.now();
    try {
      await createModelIndexes(modelName);
      console.log(`[migrate] indexes ok: ${modelName} (${Date.now() - startedAt}ms)`);
    } catch (error) {
      failed += 1;
      const message = errorMessage(error);
      console.error(`[migrate] indexes FAILED: ${modelName} — ${message}`);

      const code = (error as { code?: number })?.code;
      if (code === 85 || code === 86 || /already exists with different options/i.test(message)) {
        console.error(
          `[migrate]   ^ an index of this name already exists with different options. ` +
            `Drop the old one in a migration (see migrateCareerProfileEmployeeCodeIndex) ` +
            `so it can be rebuilt from the current schema.`,
        );
      }
      if (/collation is not implemented/i.test(message)) {
        console.error(
          `[migrate]   ^ this engine does not support index collations. Normalise the ` +
            `field's casing in the schema and drop the collation from the index instead.`,
        );
      }
    }
  }

  console.log(`[migrate] index sync complete: ${modelNames.length - failed}/${modelNames.length} models`);
  return failed;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log('[migrate] connecting...');
  await connectDB();
  console.log(`[migrate] connected to ${mongoose.connection.name}`);

  console.log('[migrate] running startup migrations...');
  await runStartupMigrations();
  console.log('[migrate] startup migrations complete');

  console.log('[migrate] syncing indexes...');
  const failed = await buildIndexes();

  await mongoose.disconnect();
  console.log(`[migrate] done in ${Date.now() - startedAt}ms`);

  if (failed > 0) {
    console.error(`[migrate] ${failed} model(s) failed to build indexes`);
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('[migrate] FAILED:', error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
