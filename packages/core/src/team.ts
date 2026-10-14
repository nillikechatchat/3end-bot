// Team and storage: bots, group chats and the room log, persisted as JSON.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Bot, Group, RoomMessage, TeamState } from './types.ts';
import { nameProblem } from './mentions.ts';

export class TeamStore {
  private state: TeamState = { bots: [], groups: [] };
  private readonly logs = new Map<string, RoomMessage[]>();

  constructor(private readonly dataDir: string) {}

  private get file(): string {
    return join(this.dataDir, 'state.json');
  }

  async load(): Promise<TeamState> {
    try {
      this.state = JSON.parse(await readFile(this.file, 'utf8')) as TeamState;
    } catch {
      this.seed();
      await this.save();
    }
    if (!Array.isArray(this.state.bots) || this.state.bots.length === 0) {
      this.seed();
      await this.save();
    }
    return this.state;
  }

  async save(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.file, JSON.stringify(this.state, null, 2), 'utf8');
  }

  private seed(): void {
    const now = Date.now();
    const chief: Bot = {
      id: randomUUID(), name: 'Chief', role: '主管', main: true, createdAt: now,
      instructions: '你是团队主管。回答用户，并在需要时用 @Name 把工作交给合适的成员。',
    };
    const writer: Bot = {
      id: randomUUID(), name: 'Writer', role: '写手', createdAt: now,
      instructions: '你负责写作、文案与大纲。',
    };
    const coder: Bot = {
      id: randomUUID(), name: 'Coder', role: '程序员', createdAt: now,
      instructions: '你负责技术实现、代码与调试。',
    };
    this.state = {
      bots: [chief, writer, coder],
      groups: [{
        id: randomUUID(), name: 'Team', notice: '团队协作群：主管先答，需要谁再 @ 谁。',
        admin: chief.id, members: [chief.id, writer.id, coder.id], createdAt: now,
      }],
    };
  }

  bots(): Bot[] {
    return this.state.bots;
  }

  groups(): Group[] {
    return this.state.groups;
  }

  botById(id: string): Bot | undefined {
    return this.state.bots.find((bot) => bot.id === id);
  }

  groupById(id: string): Group | undefined {
    return this.state.groups.find((group) => group.id === id);
  }

  createBot(input: { name: string; role?: string; instructions?: string; model?: string; main?: boolean }): Bot {
    const problem = nameProblem(input.name);
    if (problem) throw new Error(problem);
    if (this.state.bots.some((bot) => bot.name.toLowerCase() === input.name.trim().toLowerCase())) {
      throw new Error(`A bot named "${input.name}" already exists`);
    }
    const bot: Bot = {
      id: randomUUID(),
      name: input.name.trim(),
      role: input.role?.trim() || undefined,
      instructions: input.instructions?.trim() || undefined,
      model: input.model?.trim() || undefined,
      main: input.main === true,
      createdAt: Date.now(),
    };
    this.state.bots.push(bot);
    return bot;
  }

  updateBot(id: string, patch: Partial<Bot>): Bot {
    const bot = this.botById(id);
    if (!bot) throw new Error('bot not found');
    Object.assign(bot, patch, { id: bot.id, createdAt: bot.createdAt });
    return bot;
  }

  deleteBot(id: string): void {
    this.state.bots = this.state.bots.filter((bot) => bot.id !== id);
    this.state.groups = this.state.groups.map((group) => ({
      ...group,
      members: group.members.filter((member) => member !== id),
    }));
    for (const group of this.state.groups) {
      if (group.admin === id && group.members[0]) group.admin = group.members[0];
    }
  }

  createGroup(input: { name: string; admin: string; members: string[]; notice?: string }): Group {
    if (!this.botById(input.admin)) throw new Error('admin bot not found');
    const members = [...new Set([input.admin, ...input.members])].filter((id) => this.botById(id));
    if (members.length === 0) throw new Error('a group needs at least one member');
    const group: Group = {
      id: randomUUID(),
      name: input.name.trim() || 'Group',
      notice: input.notice?.trim() || undefined,
      admin: input.admin,
      members,
      createdAt: Date.now(),
    };
    this.state.groups.push(group);
    return group;
  }

  deleteGroup(id: string): void {
    this.state.groups = this.state.groups.filter((group) => group.id !== id);
    this.logs.delete(id);
  }

  appendMessage(roomId: string, message: Omit<RoomMessage, 'id' | 'roomId' | 'ts'> & Partial<Pick<RoomMessage, 'id' | 'ts'>>): RoomMessage {
    const full: RoomMessage = {
      id: message.id ?? randomUUID(),
      roomId,
      authorId: message.authorId,
      authorName: message.authorName,
      text: message.text,
      kind: message.kind,
      ts: message.ts ?? Date.now(),
    };
    const log = this.logs.get(roomId) ?? [];
    log.push(full);
    this.logs.set(roomId, log.slice(-500));
    return full;
  }

  messages(roomId: string): RoomMessage[] {
    return this.logs.get(roomId) ?? [];
  }
}
