// OpenAI-compatible chat client. Any provider that speaks /chat/completions works.
// With no API key configured the client answers from a local mock, so the whole
// three-end flow runs before any key is set.

import type { ChatMsg } from './types.ts';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  return {
    baseUrl: (env.USER_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: env.USER_LLM_API_KEY || '',
    model: env.USER_LLM_MODEL || 'gpt-4o-mini',
  };
}

export function llmConfigured(cfg: LlmConfig): boolean {
  return cfg.apiKey.trim() !== '';
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
}

export async function chat(messages: ChatMsg[], cfg: LlmConfig, opts: ChatOptions = {}): Promise<string> {
  if (!llmConfigured(cfg)) return mockReply(messages);
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: opts.model || cfg.model,
      messages,
      temperature: opts.temperature ?? 0.7,
      stream: false,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`LLM request failed: ${res.status} ${detail}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return String(data?.choices?.[0]?.message?.content ?? '').trim();
}

function mockReply(messages: ChatMsg[]): string {
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const name = /Your name is "([^"]+)"/.exec(system)?.[1]?.trim() || 'Bot';
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  if (/^\s*\[pass\]\s*$/i.test(lastUser)) return '[PASS]';
  const quoted = lastUser.replace(/\s+/g, ' ').trim().slice(0, 120);
  return `（mock 模式，未配置 USER_LLM_API_KEY）我是 ${name}，收到：「${quoted}」。在 .env 配置 USER_LLM_* 后可接入真实模型。`;
}
