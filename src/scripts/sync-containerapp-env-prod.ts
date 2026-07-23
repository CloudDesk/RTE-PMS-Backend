import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { request } from 'https';
import { resolve } from 'path';

type ParsedEnv = Record<string, string>;

interface Options {
  appName: string;
  resourceGroup: string;
  envFile: string;
  expectedMongoHost: string;
  expectedMongoDatabase: string;
  dryRun: boolean;
  yes: boolean;
  replace: boolean;
  skipHealth: boolean;
  skipMongoGuard: boolean;
}

const DEFAULT_APP_NAME = 'rte-pms-prod';
const DEFAULT_RESOURCE_GROUP = 'RTE';
const DEFAULT_ENV_FILE = '.env.prod';
const DEFAULT_EXPECTED_MONGODB_HOST = 'rtedatabases.global.mongocluster.cosmos.azure.com';
const DEFAULT_EXPECTED_MONGODB_DATABASE = 'rte_pms_prod';

const EXCLUDED_ENV_KEYS = new Set([
  'DOCUMENTDB_URI',
  'ACTUAL_DOCUMENTDB_URI',
]);

const SENSITIVE_KEY_PATTERNS = [
  /SECRET/i,
  /PASSWORD/i,
  /PRIVATE_KEY/i,
  /SERVICE_ACCOUNT/i,
  /MONGODB_URI/i,
  /DOCUMENTDB_URI/i,
  /TOKEN/i,
];

function parseArgs(argv: string[]): Options {
  const options: Options = {
    appName: DEFAULT_APP_NAME,
    resourceGroup: DEFAULT_RESOURCE_GROUP,
    envFile: DEFAULT_ENV_FILE,
    expectedMongoHost: DEFAULT_EXPECTED_MONGODB_HOST,
    expectedMongoDatabase: DEFAULT_EXPECTED_MONGODB_DATABASE,
    dryRun: false,
    yes: false,
    replace: false,
    skipHealth: false,
    skipMongoGuard: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--yes') options.yes = true;
    else if (arg === '--replace') options.replace = true;
    else if (arg === '--skip-health') options.skipHealth = true;
    else if (arg === '--skip-mongo-guard') options.skipMongoGuard = true;
    else if (arg === '--app-name' && next) {
      options.appName = next;
      i += 1;
    } else if (arg === '--resource-group' && next) {
      options.resourceGroup = next;
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
  npm run containerapp:env:prod:dry-run
  npm run containerapp:env:prod

Options:
  --env-file <path>        Env file to sync. Default: .env.prod
  --app-name <name>        Azure Container App name. Default: rte-pms-prod
  --resource-group <name>  Azure resource group. Default: RTE
  --dry-run                Print keys only; do not update Azure
  --yes                    Required for live update
  --replace                Replace all existing container env vars instead of set/update
  --skip-health            Skip /health/live and /health/ready checks
  --skip-mongo-guard       Do not require the expected production MongoDB host/database
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

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function maskedPreview(key: string, value: string): string {
  if (!value) return '<empty>';
  if (isSensitiveKey(key)) {
    if (key.endsWith('_URI')) {
      try {
        const url = new URL(value);
        return `${url.protocol}//<masked>@${url.host}${url.pathname}${url.search ? '?...' : ''}`;
      } catch {
        return '<masked>';
      }
    }
    return '<masked>';
  }
  return value;
}

function buildContainerEnv(env: ParsedEnv): ParsedEnv {
  const output: ParsedEnv = {};

  for (const [key, value] of Object.entries(env)) {
    if (EXCLUDED_ENV_KEYS.has(key)) continue;
    if (value === undefined || value === '') continue;
    output[key] = value;
  }

  output.CONFIG_VERSION = new Date().toISOString().replace(/[:.]/g, '-');
  return output;
}

function validateEnv(env: ParsedEnv, options: Options): void {
  const requiredKeys = [
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

  const missing = requiredKeys.filter((key) => !env[key]);
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
        'Update .env.prod first or pass --skip-mongo-guard intentionally.'
      );
    }

    if (mongoDatabase !== options.expectedMongoDatabase) {
      throw new Error(
        `MONGODB_URI database guard failed. Expected ${options.expectedMongoDatabase}, found ${mongoDatabase}. ` +
        'Update .env.prod first or pass --skip-mongo-guard intentionally.'
      );
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (value.trim().endsWith(',')) {
      console.warn(`[sync] Warning: ${key} ends with a comma. Verify this is intentional before live sync.`);
    }
  }
}

function runAz(args: string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('az', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
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
      else rejectPromise(new Error(stderr.trim() || `az exited with code ${code}`));
    });
  });
}

async function getContainerAppState(options: Options): Promise<{
  latestRevision?: string;
  fqdn?: string;
}> {
  const output = await runAz([
    'containerapp',
    'show',
    '--name',
    options.appName,
    '--resource-group',
    options.resourceGroup,
    '--query',
    '{latestRevision:properties.latestRevisionName,fqdn:properties.configuration.ingress.fqdn}',
    '--output',
    'json',
  ]);

  return JSON.parse(output) as { latestRevision?: string; fqdn?: string };
}

async function updateContainerAppEnv(options: Options, env: ParsedEnv): Promise<void> {
  const envArgs = Object.entries(env).map(([key, value]) => `${key}=${value}`);
  const envModeArg = options.replace ? '--replace-env-vars' : '--set-env-vars';

  await runAz([
    'containerapp',
    'update',
    '--name',
    options.appName,
    '--resource-group',
    options.resourceGroup,
    envModeArg,
    ...envArgs,
    '--output',
    'none',
  ]);
}

function httpGet(url: string): Promise<{ statusCode?: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = request(url, { method: 'GET', timeout: 20000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk.toString();
      });
      res.on('end', () => resolvePromise({ statusCode: res.statusCode, body }));
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out: ${url}`));
    });
    req.on('error', rejectPromise);
    req.end();
  });
}

async function waitForHealth(fqdn: string): Promise<void> {
  const endpoints = ['health/live', 'health/ready'];

  for (const endpoint of endpoints) {
    const url = `https://${fqdn}/${endpoint}`;

    for (let attempt = 1; attempt <= 30; attempt += 1) {
      try {
        const response = await httpGet(url);
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          console.log(`[health] ${endpoint}: ok`);
          break;
        }
      } catch {
        // Retry below without printing secret-bearing context.
      }

      if (attempt === 30) {
        throw new Error(`${endpoint} did not become healthy after 30 attempts.`);
      }

      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10000));
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const envFilePath = resolve(process.cwd(), options.envFile);
  const localEnv = parseEnvFile(envFilePath);
  validateEnv(localEnv, options);
  const containerEnv = buildContainerEnv(localEnv);

  console.log(`[sync] Container App: ${options.appName}`);
  console.log(`[sync] Resource group: ${options.resourceGroup}`);
  console.log(`[sync] Env file: ${envFilePath}`);
  console.log(`[sync] Mode: ${options.replace ? 'replace all env vars' : 'set/update env vars'}`);
  console.log(`[sync] Keys to sync (${Object.keys(containerEnv).length}):`);
  for (const key of Object.keys(containerEnv).sort()) {
    console.log(`  ${key}=${maskedPreview(key, containerEnv[key])}`);
  }

  if (options.dryRun) {
    console.log('[sync] Dry run only. Azure was not updated.');
    return;
  }

  if (!options.yes) {
    throw new Error('Live update requires --yes. Run the dry-run first if you want to preview keys.');
  }

  const before = await getContainerAppState(options);
  console.log(`[sync] Current revision: ${before.latestRevision || 'unknown'}`);

  await updateContainerAppEnv(options, containerEnv);

  const after = await getContainerAppState(options);
  console.log(`[sync] Updated revision: ${after.latestRevision || 'unknown'}`);

  if (!options.skipHealth) {
    if (!after.fqdn) throw new Error('Container App FQDN was not found; cannot run health checks.');
    await waitForHealth(after.fqdn);
  }

  console.log('[sync] Container App env sync completed.');
}

main().catch((error) => {
  console.error(`[sync] Failed: ${(error as Error).message}`);
  process.exit(1);
});
