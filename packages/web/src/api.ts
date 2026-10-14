// The one API surface all three ends share. The web client calls it directly; the
// desktop shell loads this page; the mobile app re-implements these calls.

import type { Bot, Group, RoomMessage } from '@3end/core/types';

export interface State {
  bots: Bot[];
  groups: Group[];
  model: { configured: boolean; baseUrl: string; model: string };
}

export interface SendResult {
  roomId: string;
  mock: boolean;
  messages: RoomMessage[];
  produced: RoomMessage[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(data?.error ?? `${res.status} ${res.statusText}`);
  return data as T;
}

export const api = {
  state: () => call<State>('/api/state'),
  messages: (roomId: string) => call<{ messages: RoomMessage[] }>(`/api/rooms/${encodeURIComponent(roomId)}/messages`),
  send: (roomId: string, text: string) =>
    call<SendResult>(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  createBot: (input: { name: string; role?: string; instructions?: string; model?: string }) =>
    call<Bot>('/api/bots', { method: 'POST', body: JSON.stringify(input) }),
  deleteBot: (id: string) => call<State>(`/api/bots/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createGroup: (input: { name: string; admin: string; members: string[]; notice?: string }) =>
    call<Group>('/api/groups', { method: 'POST', body: JSON.stringify(input) }),
  deleteGroup: (id: string) => call<State>(`/api/groups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  memory: (scope: string) => call<{ entries: string[] }>(`/api/memory?scope=${encodeURIComponent(scope)}`),
};

/** Playful-safe room id: a group id, or `dm:<botId>` for a one-to-one chat. */
export const dmRoom = (botId: string) => `dm:${botId}`;
