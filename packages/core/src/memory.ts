// Long-lived memory: plain Markdown, one entry per line, ending in "[source: …; added: …]".
// Two scopes: each bot has its own memory, the team shares one. Kept deliberately small:
// entries are capped, the file is capped, and anything that looks like a secret is refused.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ENTRY_MAX = 300;
const FILE_MAX = 4000;
const SECRET = /(sk-[A-Za-z0-9_-]{8,}|(api[_-]?key|token|password|secret)\s*[:=]\s*\S+|-----BEGIN [A-Z ]+-----)/i;

export function looksSecret(text: string): boolean {
  return SECRET.test(text);
}

export type MemoryAddResult = { ok: true } | { ok: false; error: string };

export class MemoryStore {
  constructor(private readonly baseDir: string) {}

  private file(scope: string): string {
    return scope === 'team'
      ? join(this.baseDir, 'team', 'MEMORY.md')
      : join(this.baseDir, 'bots', scope, 'MEMORY.md');
  }

  async list(scope: string): Promise<string[]> {
    try {
      const raw = await readFile(this.file(scope), 'utf8');
      return raw.split('\n').map((line) => line.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  async add(scope: string, text: string, source = 'manual'): Promise<MemoryAddResult> {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) return { ok: false, error: 'empty entry' };
    if (clean.length > ENTRY_MAX) return { ok: false, error: `entry too long (max ${ENTRY_MAX} chars)` };
    if (looksSecret(clean)) return { ok: false, error: 'refused: looks like a secret' };
    const lines = await this.list(scope);
    if (lines.some((line) => line.startsWith(clean))) return { ok: true };
    const entry = `${clean} [source: ${source}; added: ${new Date().toISOString().slice(0, 10)}]`;
    const next = [...lines, entry];
    const body = next.join('\n');
    if (body.length > FILE_MAX) return { ok: false, error: `memory full (max ${FILE_MAX} chars)` };
    const file = this.file(scope);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${body}\n`, 'utf8');
    return { ok: true };
  }

  async search(scope: string, query = ''): Promise<string[]> {
    const q = query.toLowerCase();
    const lines = await this.list(scope);
    return q ? lines.filter((line) => line.toLowerCase().includes(q)) : lines;
  }
}
