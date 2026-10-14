// Tiny .env loader: no dependency, does not override values already set in the
// environment. Model keys live here and stay out of source control.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadDotEnv(cwd = process.cwd()): void {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
