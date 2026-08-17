import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

type ParsedEnv = Record<string, string>;
type TargetKind = 'variable' | 'secret' | 'skipped';

interface Options {
  repo: string;
  environment: string;
  envFile: string;
  expectedMongoHost: string;
  expectedMongoDatabase: string;
  dryRun: boolean;
  yes: boolean;
  skipMongoGuard: boolean;
  skipProdUrlGuard: boolean;
}

const DEFAULT_REPO = 'CloudDesk/RTE-PMS-Backend';
const DEFAULT_ENVIRONMENT = 'PROD';
const DEFAULT_ENV_FILE = '.env.prod';
const DEFAULT_EXPECTED_MONGODB_HOST = 'rtedatabases.global.mongocluster.cosmos.azure.com';
const DEFAULT_EXPECTED_MONGODB_DATABASE = 'rte_pms_prod';

const SKIPPED_KEYS = new Set([
  'DOCUMENTDB_URI',
  'ACTUAL_DOCUMENTDB_URI',
]);

const SAFE_VARIABLE_KEYS = new Set([
  'API_URL',
  'APP_URL',
  'COMPANY_NAME',
  'CORS_ORIGINS',
  'EMAIL_SECURE',
  'GCP_STORAGE_BUCKET',
  'GMAIL_HOST',
  'GMAIL_PORT',
  'GMAIL_TLS_REJECT_UNAUTHORIZED',
  'HOST',
  'LOGO_URL',
  'MAIL_SERVICE',
  'NEW_REBATE_THRESHHOLD',
  'NEW_RELIEF_BASE',
  'NODE_ENV',
  'OLD_REBATE_THRESHHOLD',
  'OLD_RELIEF_BASE',
  'PORT',
  'PROTOCOL',
]);

const REQUIRED_KEYS = [
  'MONGODB_URI',
  'NODE_ENV',
  'PORT',
  'HOST',
  'JWT_SECRET',
  'CORS_ORIGINS',
  'COOKIE_SECRET',
  'GMAIL_HOST',
  'GMAIL_PORT',
  'GMAIL_AUTH_USER',
  'GMAIL_AUTH_PASSWORD',
];

function parseArgs(argv: string[]): Options {
  const options: Options = {
    repo: DEFAULT_REPO,
    environment: DEFAULT_ENVIRONMENT,
    envFile: DEFAULT_ENV_FILE,
    expectedMongoHost: DEFAULT_EXPECTED_MONGODB_HOST,
    expectedMongoDatabase: DEFAULT_EXPECTED_MONGODB_DATABASE,
    dryRun: false,
    yes: false,
    skipMongoGuard: false,
    skipProdUrlGuard: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--yes') options.yes = true;
    else if (arg === '--skip-mongo-guard') options.skipMongoGuard = true;
    else if (arg === '--skip-prod-url-guard') options.skipProdUrlGuard = true;
    else if (arg === '--repo' && next) {
      options.repo = next;
      i += 1;
    } else if (arg === '--environment' && next) {
      options.environment = next;
      i += 1;
    } else if (arg === '--env-file' && next) {
      options.envFile = next;
      i += 1;
    } else if (arg === '--expected-mongodb-host' && next) {
      options.expectedMongoHost = next;
      i += 1;
    } else if (arg === '--expected-mongodb-database' && next) {
      options.expectedMongoDatabase = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Usage:
  npm run github:env:prod:dry-run
  npm run github:env:prod

Options:
  --env-file <path>        Env file to sync. Default: .env.prod
  --repo <owner/repo>      GitHub repo. Default: CloudDesk/RTE-PMS-Backend
  --environment <name>     GitHub environment. Default: PROD
  --dry-run                Print planned upserts only; do not update GitHub
  --yes                    Required for live update
  --skip-mongo-guard       Do not require the expected production MongoDB host/database
  --skip-prod-url-guard    Allow localhost-style API_URL/APP_URL values for PROD
  --expected-mongodb-host <host>
                            Default: rtedatabases.global.mongocluster.cosmos.azure.com
  --expected-mongodb-database <db>
                            Default: rte_pms_prod
`);
}

function parseEnvFile(filePath: string): ParsedEnv {
  if (!existsSync(filePath)) {
    throw new Error(`Env file not found: ${filePath}`);
  }

  const env: ParsedEnv = {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function classifyKey(key: string): TargetKind {
  if (SKIPPED_KEYS.has(key)) return 'skipped';
  if (SAFE_VARIABLE_KEYS.has(key)) return 'variable';
  return 'secret';
}

function maskedPreview(kind: TargetKind, value: string): string {
  if (!value) return '<empty>';
  if (kind === 'secret') return '<masked>';
  if (kind === 'skipped') return '<skipped>';
  return value;
}

function validateEnv(env: ParsedEnv, options: Options): void {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required env keys in local file: ${missing.join(', ')}`);
  }

  let mongoUrl: URL;
  try {
    mongoUrl = new URL(env.MONGODB_URI);
  } catch (error) {
    throw new Error(`MONGODB_URI is not a valid URI: ${(error as Error).message}`);
  }

  if (!mongoUrl.pathname || mongoUrl.pathname === '/') {
    throw new Error('MONGODB_URI must include the database path.');
  }

  if (!options.skipMongoGuard) {
    const mongoDatabase = mongoUrl.pathname.replace(/^\//, '');
    if (mongoUrl.host !== options.expectedMongoHost) {
      throw new Error(
        `MONGODB_URI host guard failed. Expected ${options.expectedMongoHost}, found ${mongoUrl.host}. ` +
        `Update ${options.envFile} first or pass --skip-mongo-guard intentionally.`
      );
    }

    if (mongoDatabase !== options.expectedMongoDatabase) {
      throw new Error(
        `MONGODB_URI database guard failed. Expected ${options.expectedMongoDatabase}, found ${mongoDatabase}. ` +
        `Update ${options.envFile} first or pass --skip-mongo-guard intentionally.`
      );
    }
  }

  if (options.environment.toUpperCase() === 'PROD' && !options.skipProdUrlGuard) {
    const localUrlKeys = ['API_URL', 'APP_URL'].filter((key) => isLocalUrlValue(env[key]));
    if (localUrlKeys.length) {
      throw new Error(
        `Refusing to sync localhost-style values to GitHub PROD: ${localUrlKeys.join(', ')}. ` +
        'Update the env file first or pass --skip-prod-url-guard intentionally.'
      );
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (value.trim().endsWith(',')) {
      console.warn(`[github-env] Warning: ${key} ends with a comma. Verify this is intentional before live sync.`);
    }
  }
}

function isLocalUrlValue(value: string | undefined): boolean {
  if (!value) return false;
  return /(^|[/:,.])(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?=[:/,.]|$)/i.test(value);
}

function runGh(args: string[], input?: string): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('gh', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout);
      else rejectPromise(new Error(stderr.trim() || `gh exited with code ${code}`));
    });

    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function upsertGitHubValue(options: Options, key: string, value: string, kind: TargetKind): Promise<void> {
  if (kind === 'skipped') return;

  const command = kind === 'variable' ? 'variable' : 'secret';
  await runGh([
    command,
    'set',
    key,
    '--repo',
    options.repo,
    '--env',
    options.environment,
  ], value);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const envFilePath = resolve(process.cwd(), options.envFile);
  const localEnv = parseEnvFile(envFilePath);

  validateEnv(localEnv, options);

  const entries = Object.entries(localEnv)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => ({ key, value, kind: classifyKey(key) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const variableCount = entries.filter((entry) => entry.kind === 'variable').length;
  const secretCount = entries.filter((entry) => entry.kind === 'secret').length;
  const skippedCount = entries.filter((entry) => entry.kind === 'skipped').length;

  console.log(`[github-env] Repo: ${options.repo}`);
  console.log(`[github-env] Environment: ${options.environment}`);
  console.log(`[github-env] Env file: ${envFilePath}`);
  console.log(`[github-env] Planned upserts: ${variableCount} variables, ${secretCount} secrets, ${skippedCount} skipped`);

  for (const entry of entries) {
    console.log(`  ${entry.kind.toUpperCase()} ${entry.key}=${maskedPreview(entry.kind, entry.value)}`);
  }

  if (options.dryRun) {
    console.log('[github-env] Dry run only. GitHub was not updated.');
    return;
  }

  if (!options.yes) {
    throw new Error('Live update requires --yes. Run the dry-run first if you want to preview the plan.');
  }

  await runGh(['repo', 'view', options.repo, '--json', 'nameWithOwner']);

  for (const entry of entries) {
    await upsertGitHubValue(options, entry.key, entry.value, entry.kind);
    if (entry.kind !== 'skipped') {
      console.log(`[github-env] Upserted ${entry.kind}: ${entry.key}`);
    }
  }

  console.log('[github-env] GitHub PROD environment sync completed.');
}

main().catch((error) => {
  console.error(`[github-env] Failed: ${(error as Error).message}`);
  process.exit(1);
});
