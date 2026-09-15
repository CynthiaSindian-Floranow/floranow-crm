import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env parser — the package has no runtime dependencies.
const parseDotEnv = (path: string): Record<string, string> => {
  if (!existsSync(path)) {
    return {};
  }

  const values: Record<string, string> = {};

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();

    if (line === '' || line.startsWith('#') || !line.includes('=')) {
      continue;
    }

    const eq = line.indexOf('=');
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
};

export type Remote = 'dev' | 'prod';

export type SyncConfig = {
  remote: Remote;
  twentyUrl: string;
  twentyApiKey: string;
  erpUrl: string;
  erpApiKey: string;
};

// The Twenty credentials already live in ../data-model/.env, so that file is
// the fallback — one less place for keys to drift apart.
export const loadConfig = (remote: Remote): SyncConfig => {
  const env = {
    ...parseDotEnv(join(packageRoot, '..', 'data-model', '.env')),
    ...parseDotEnv(join(packageRoot, '.env')),
    ...process.env,
  };

  const prefix = remote.toUpperCase();
  const pick = (key: string): string => {
    const value = env[key];

    if (value === undefined || value === '') {
      throw new Error(
        `${key} is not set — add it to packages/twenty-apps/floranow/erp-sync/.env (see .env.sample)`,
      );
    }

    return value;
  };

  return {
    remote,
    twentyUrl: pick(`TWENTY_${prefix}_URL`).replace(/\/$/, ''),
    twentyApiKey: pick(`TWENTY_${prefix}_API_KEY`),
    erpUrl: pick(`ERP_${prefix}_URL`).replace(/\/$/, ''),
    erpApiKey: pick(`ERP_${prefix}_API_KEY`),
  };
};
