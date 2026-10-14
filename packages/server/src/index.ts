// Standalone backend: the API every end (web, desktop, mobile) talks to, plus the
// built web client. No coupling to any other project; start it and it self-serves.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  TeamStore, MemoryStore, llmConfigFromEnv, llmConfigured,
  runDmTurn, runGroupTurn, type Engine,
} from '@3end/core';
import { loadDotEnv } from './env.ts';
import { serveStatic } from './static.ts';

loadDotEnv();

const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = resolve(here, '../../web/dist');
const DATA_DIR = resolve(process.env.DATA_DIR || join(process.cwd(), 'data'));
const PORT = Number(process.env.PORT || 8787);

const store = new TeamStore(DATA_DIR);
const memory = new MemoryStore(join(DATA_DIR, 'memory'));
const engine = (): Engine => ({ store, memory, llm: llmConfigFromEnv() });

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function stateView() {
  const llm = llmConfigFromEnv();
  return {
    bots: store.bots(),
    groups: store.groups(),
    model: { configured: llmConfigured(llm), baseUrl: llm.baseUrl, model: llm.model },
  };
}

function roomMessages(roomId: string) {
  return store.messages(roomId);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') return send(res, 204, undefined);

  // --- API ---
  if (path === '/api/health') return send(res, 200, { ok: true, dataDir: DATA_DIR });

  if (path === '/api/state' && method === 'GET') return send(res, 200, stateView());

  if (path === '/api/bots' && method === 'POST') {
    const body = await readJson(req);
    const bot = store.createBot({
      name: String(body.name ?? ''),
      role: body.role ? String(body.role) : undefined,
      instructions: body.instructions ? String(body.instructions) : undefined,
      model: body.model ? String(body.model) : undefined,
      main: body.main === true,
    });
    await store.save();
    return send(res, 201, bot);
  }

  const botMatch = /^\/api\/bots\/([^/]+)$/.exec(path);
  if (botMatch) {
    const id = decodeURIComponent(botMatch[1]);
    if (method === 'PATCH') {
      const body = await readJson(req);
      try {
        const bot = store.updateBot(id, {
          name: body.name ? String(body.name) : undefined,
          role: body.role !== undefined ? String(body.role) : undefined,
          instructions: body.instructions !== undefined ? String(body.instructions) : undefined,
          model: body.model !== undefined ? String(body.model) : undefined,
          main: typeof body.main === 'boolean' ? body.main : undefined,
        });
        await store.save();
        return send(res, 200, bot);
      } catch (error) {
        return send(res, 404, { error: (error as Error).message });
      }
    }
    if (method === 'DELETE') {
      store.deleteBot(id);
      await store.save();
      return send(res, 200, stateView());
    }
  }

  if (path === '/api/groups' && method === 'POST') {
    const body = await readJson(req);
    try {
      const group = store.createGroup({
        name: String(body.name ?? 'Group'),
        admin: String(body.admin ?? ''),
        members: Array.isArray(body.members) ? body.members.map(String) : [],
        notice: body.notice ? String(body.notice) : undefined,
      });
      await store.save();
      return send(res, 201, group);
    } catch (error) {
      return send(res, 400, { error: (error as Error).message });
    }
  }

  const groupMatch = /^\/api\/groups\/([^/]+)$/.exec(path);
  if (groupMatch && method === 'DELETE') {
    store.deleteGroup(decodeURIComponent(groupMatch[1]));
    await store.save();
    return send(res, 200, stateView());
  }

  const msgsMatch = /^\/api\/rooms\/(.+)\/messages$/.exec(path);
  if (msgsMatch) {
    const roomId = decodeURIComponent(msgsMatch[1]);
    if (method === 'GET') return send(res, 200, { roomId, messages: roomMessages(roomId) });
    if (method === 'POST') {
      const body = await readJson(req);
      const text = String(body.text ?? '').trim();
      if (!text) return send(res, 400, { error: 'text is required' });
      try {
        const result = roomId.startsWith('dm:')
          ? await runDmTurn(engine(), roomId.slice(3), text)
          : await runGroupTurn(engine(), roomId, text);
        await store.save();
        return send(res, 200, { roomId, mock: result.mock, messages: roomMessages(roomId), produced: result.messages });
      } catch (error) {
        return send(res, 400, { error: (error as Error).message });
      }
    }
  }

  if (path === '/api/memory' && method === 'GET') {
    const scope = url.searchParams.get('scope') || 'team';
    const q = url.searchParams.get('q') || '';
    return send(res, 200, { scope, entries: await memory.search(scope, q) });
  }

  if (path === '/api/memory' && method === 'POST') {
    const body = await readJson(req);
    const scope = String(body.scope ?? 'team');
    const result = await memory.add(scope, String(body.text ?? ''), 'user');
    return send(res, result.ok ? 201 : 400, result);
  }

  if (path.startsWith('/api/')) return send(res, 404, { error: `no route for ${method} ${path}` });

  // --- Web client ---
  if (method === 'GET') {
    const served = await serveStatic(WEB_DIST, path, res);
    if (served) return;
    return send(res, 404, { error: 'web client not built. Run: npm run build' });
  }

  return send(res, 405, { error: 'method not allowed' });
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    send(res, 500, { error: (error as Error).message });
  });
});

await store.load();
server.listen(PORT, () => {
  const llm = llmConfigFromEnv();
  console.log(`[3end-bot] server on http://127.0.0.1:${PORT}`);
  console.log(`[3end-bot] data dir: ${DATA_DIR}`);
  console.log(`[3end-bot] model: ${llmConfigured(llm) ? `${llm.model} via ${llm.baseUrl}` : 'mock (set USER_LLM_* in .env)'}`);
});
