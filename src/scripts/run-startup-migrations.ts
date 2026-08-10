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

async function buildIndexes(): Promise<number> {
  const modelNames = mongoose.modelNames().sort();
  let failed = 0;

  for (const modelName of modelNames) {
    const startedAt = Date.now();
    try {
      await mongoose.model(modelName).createIndexes();
      console.log(`[migrate] indexes ok: ${modelName} (${Date.now() - startedAt}ms)`);
    } catch (error) {
      failed += 1;
      console.error(
        `[migrate] indexes FAILED: ${modelName} —`,
        error instanceof Error ? error.message : error,
      );
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
