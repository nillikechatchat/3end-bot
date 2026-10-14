// "@Name" is read by one rule everywhere: the group host picks who answers with it,
// and the web client draws the same mentions, so what the user sees called is what gets
// called. Pure and framework-free, so host and client share it.
//
// Ported from DS Bot (Fei2411/DeepSeek-Bot) `src/shared/mentions.js`.

export const ALL_WORDS = ['all', 'everyone', '所有人', '全体'];

// A letter, digit, "_" or "-" after a name means a longer word ("@Mi" in "@MiniMax"),
// and "/", "\" or a "." that goes on into a word mean a path: "@docs/guide.md" must not
// call a bot named Docs. A letter, digit, "_", "." or "/" before "@" means an address.
const NAME_GOES_ON = /^(?:[a-z0-9_\-/\\]|\.[a-z0-9_-])/i;
const ADDRESS_BEFORE = /[a-z0-9_./]/i;
// Code and Markdown links, with or without a title, are literal text.
const LITERAL = /```[\s\S]*?(?:```|$)|`[^`\n]*`|\[[^\]\n]*\]\([^)\s]*(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\)/g;

export interface Mentionable {
  id: string;
  name: string;
}

export interface MentionSpan {
  start: number;
  end: number;
  bot?: Mentionable;
  all?: boolean;
}

// What a bot may be named: something "@" can call without a second reading.
export function nameProblem(name?: string): string | undefined {
  const text = String(name ?? '').trim();
  if (text === '') return 'A bot needs a name';
  if (/[@`\r\n]/.test(text)) return 'A bot name cannot contain @, ` or a line break';
  if (ALL_WORDS.includes(text.toLowerCase())) return `"${text}" calls everyone, so it cannot be a bot name`;
  return undefined;
}

const fitsAt = (text: string, at: number, word: string): boolean =>
  text.slice(at, at + word.length).toLowerCase() === word.toLowerCase() &&
  !NAME_GOES_ON.test(text.slice(at + word.length));

const overlaps = (spans: { start: number; end: number }[], start: number, end: number): boolean =>
  spans.some((span) => start < span.end && span.start < end);

// Every "@Name" and "@all" outside code, links and paths, in order. Longest names match
// first, so "@New Bot 2" is never "@New Bot"; a name may hold spaces.
export function mentionSpans(text: string, bots: Mentionable[]): MentionSpan[] {
  const value = String(text ?? '');
  const skip = [...value.matchAll(LITERAL)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  const byLength = bots.filter((bot) => bot?.name).sort((a, b) => b.name.length - a.name.length);
  const spans: MentionSpan[] = [];
  for (let at = value.indexOf('@'); at !== -1; at = value.indexOf('@', at + 1)) {
    if ((at > 0 && ADDRESS_BEFORE.test(value[at - 1])) || overlaps(skip, at, at + 1)) continue;
    const bot = byLength.find((candidate) => fitsAt(value, at + 1, candidate.name));
    const all = bot ? undefined : ALL_WORDS.find((word) => fitsAt(value, at + 1, word));
    if (!bot && !all) continue;
    const end = at + 1 + (bot ? bot.name.length : all!.length);
    spans.push(bot ? { start: at, end, bot } : { start: at, end, all: true });
    at = end - 1;
  }
  return spans;
}

/** The bot ids a message calls, in order, with duplicates removed. */
export function mentionedBotIds(text: string, bots: Mentionable[]): string[] {
  const ids: string[] = [];
  for (const span of mentionSpans(text, bots)) {
    if (span.bot && !ids.includes(span.bot.id)) ids.push(span.bot.id);
  }
  return ids;
}
