// The group engine: who speaks, in what order, and when the round stops.
// A group chat is one shared ordered conversation, so members speak one at a time.
// The admin answers by default; "@Name" hands the turn to a member; "[PASS]" stays quiet.

import type { Bot, ChatMsg, Group, RoomMessage } from './types.ts';
import type { TeamStore } from './team.ts';
import type { MemoryStore } from './memory.ts';
import { chat, llmConfigured, type LlmConfig } from './llm.ts';
import { mentionedBotIds } from './mentions.ts';

const MAX_TURNS = 6;
const TRANSCRIPT = 20;
const PASS = /^\[?\s*pass\s*\]?$/i;
const REVIEW = /(记住|记一下|remember|以后|从现在起|我喜欢|我不喜欢|prefer|always|never)/i;

export interface Engine {
  store: TeamStore;
  memory: MemoryStore;
  llm: LlmConfig;
}

export interface TurnResult {
  messages: RoomMessage[];
  mock: boolean;
}

function systemPrompt(bot: Bot, group: Group, bots: Bot[], teamMemory: string[], botMemory: string[]): string {
  const nameOf = (id: string) => bots.find((b) => b.id === id)?.name ?? id;
  const memberNames = group.members.map(nameOf).join(', ');
  return [
    `Your name is "${bot.name}"${bot.role ? `, ${bot.role}` : ''}, a member of the group chat "${group.name}".`,
    bot.instructions ? `Your instructions: ${bot.instructions}` : '',
    group.notice ? `Group notice: ${group.notice}` : '',
    `Group members: ${memberNames}. The group admin is ${nameOf(group.admin)}.`,
    `Team memory:\n${teamMemory.length ? teamMemory.join('\n') : '(none)'}`,
    `Your memory:\n${botMemory.length ? botMemory.join('\n') : '(none)'}`,
    'Rules: answer the latest user message in the user\'s language, concisely.',
    'If you have nothing to add, reply with exactly [PASS].',
    'To hand work to another member, write @Name in your reply.',
  ].filter(Boolean).join('\n');
}

function transcript(store: TeamStore, roomId: string, bots: Bot[]): ChatMsg[] {
  const nameOf = (id: string) => bots.find((b) => b.id === id)?.name ?? id;
  return store.messages(roomId)
    .filter((message) => message.kind !== 'system')
    .slice(-TRANSCRIPT)
    .map((message) => (
      message.authorId === 'user'
        ? { role: 'user' as const, content: message.text }
        : { role: 'assistant' as const, content: `${message.authorName}: ${message.text}` }
    ))
    .map(({ role, content }) => ({ role, content: content || `(${nameOf('')})` }));
}

async function reviewMemory(eng: Engine, botId: string, group: Group, userText: string): Promise<void> {
  if (!REVIEW.test(userText)) return;
  await eng.memory.add('team', userText, `group ${group.name}`).catch(() => undefined);
  await eng.memory.add(botId, userText, `group ${group.name}`).catch(() => undefined);
}

export async function runGroupTurn(
  eng: Engine,
  groupId: string,
  userText: string,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const group = eng.store.groupById(groupId);
  if (!group) throw new Error('group not found');
  const bots = eng.store.bots();
  const members = group.members.map((id) => eng.store.botById(id)).filter((b): b is Bot => Boolean(b));

  eng.store.appendMessage(group.id, { authorId: 'user', authorName: 'You', text: userText, kind: 'message' });
  const produced: RoomMessage[] = [];

  const direct = mentionedBotIds(userText, members);
  const queue = direct.length > 0 ? [...direct] : [group.admin];
  const spoken = new Set<string>();
  let turns = 0;

  while (queue.length > 0 && turns < MAX_TURNS) {
    const botId = queue.shift()!;
    if (spoken.has(botId)) continue;
    const bot = eng.store.botById(botId);
    if (!bot) continue;
    spoken.add(botId);
    turns += 1;

    const teamMemory = await eng.memory.list('team');
    const botMemory = await eng.memory.list(bot.id);
    const messages: ChatMsg[] = [
      { role: 'system', content: systemPrompt(bot, group, bots, teamMemory, botMemory) },
      ...transcript(eng.store, group.id, bots),
    ];
    let reply = '';
    try {
      reply = (await chat(messages, eng.llm, { model: bot.model || eng.llm.model, signal })).trim();
    } catch (error) {
      const text = `[error] ${(error as Error).message}`;
      produced.push(eng.store.appendMessage(group.id, { authorId: bot.id, authorName: bot.name, text, kind: 'system' }));
      break;
    }
    if (PASS.test(reply)) {
      produced.push(eng.store.appendMessage(group.id, { authorId: bot.id, authorName: bot.name, text: '[PASS]', kind: 'pass' }));
      continue;
    }
    produced.push(eng.store.appendMessage(group.id, { authorId: bot.id, authorName: bot.name, text: reply, kind: 'message' }));
    for (const next of mentionedBotIds(reply, members)) {
      if (!spoken.has(next)) queue.push(next);
    }
  }

  await reviewMemory(eng, group.admin, group, userText);
  return { messages: produced, mock: !llmConfigured(eng.llm) };
}

export async function runDmTurn(
  eng: Engine,
  botId: string,
  userText: string,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const bot = eng.store.botById(botId);
  if (!bot) throw new Error('bot not found');
  const roomId = `dm:${bot.id}`;
  const bots = eng.store.bots();
  eng.store.appendMessage(roomId, { authorId: 'user', authorName: 'You', text: userText, kind: 'message' });

  const teamMemory = await eng.memory.list('team');
  const botMemory = await eng.memory.list(bot.id);
  const system = [
    `Your name is "${bot.name}"${bot.role ? `, ${bot.role}` : ''}.`,
    bot.instructions ? `Your instructions: ${bot.instructions}` : '',
    `Team memory:\n${teamMemory.length ? teamMemory.join('\n') : '(none)'}`,
    `Your memory:\n${botMemory.length ? botMemory.join('\n') : '(none)'}`,
    'Answer the user in the user\'s language, concisely.',
  ].filter(Boolean).join('\n');
  const messages: ChatMsg[] = [{ role: 'system', content: system }, ...transcript(eng.store, roomId, bots)];

  const reply = (await chat(messages, eng.llm, { model: bot.model || eng.llm.model, signal })).trim();
  const message = eng.store.appendMessage(roomId, {
    authorId: bot.id, authorName: bot.name, text: reply || '[empty]', kind: 'message',
  });
  await reviewMemory(eng, bot.id, { id: roomId, name: bot.name, admin: bot.id, members: [bot.id], createdAt: 0 }, userText);
  return { messages: [message], mock: !llmConfigured(eng.llm) };
}
