// Mobile API client — the same HTTP surface as web, pointed at the standalone server.
// Set EXPO_PUBLIC_API_URL to the server address reachable from the phone
// (for example http://192.168.1.20:8787 when running on the same Wi-Fi).

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');

export interface Bot { id: string; name: string; role?: string; instructions?: string; main?: boolean }
export interface Group { id: string; name: string; notice?: string; admin: string; members: string[] }
export interface RoomMessage { id: string; roomId: string; authorId: string; authorName: string; text: string; kind: 'message' | 'pass' | 'system'; ts: number }
export interface State { bots: Bot[]; groups: Group[]; model: { configured: boolean; model: string } }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(data?.error ?? `${res.status}`);
  return data as T;
}

export const api = {
  base: BASE,
  state: () => call<State>('/api/state'),
  messages: (roomId: string) => call<{ messages: RoomMessage[] }>(`/api/rooms/${encodeURIComponent(roomId)}/messages`),
  send: (roomId: string, text: string) =>
    call<{ messages: RoomMessage[] }>(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};

export const dmRoom = (botId: string) => `dm:${botId}`;
