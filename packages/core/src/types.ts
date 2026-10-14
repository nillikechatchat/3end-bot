// Shared domain types. Kept free of node builtins so the web client can import them.

export interface Bot {
  id: string;
  name: string;
  role?: string;
  instructions?: string;
  /** Request model alias; empty means "use the default USER_LLM_MODEL". */
  model?: string;
  /** A main bot may manage the team. There can be more than one. */
  main?: boolean;
  createdAt: number;
}

export interface Group {
  id: string;
  name: string;
  notice?: string;
  /** Bot id of the group admin that answers by default. */
  admin: string;
  /** Bot ids that belong to the group. */
  members: string[];
  createdAt: number;
}

export type RoomMessageKind = 'message' | 'pass' | 'system';

export interface RoomMessage {
  id: string;
  roomId: string;
  /** 'user' for the human, otherwise a bot id. */
  authorId: string;
  authorName: string;
  text: string;
  kind: RoomMessageKind;
  ts: number;
}

export interface TeamState {
  bots: Bot[];
  groups: Group[];
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
