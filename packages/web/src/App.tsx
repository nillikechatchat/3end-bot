import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bot, Group, RoomMessage } from '@3end/core/types';
import { mentionSpans } from '@3end/core/mentions';
import { api, dmRoom, type State } from './api.ts';

type Selection = { kind: 'group'; id: string } | { kind: 'dm'; id: string };

function roomIdOf(selection: Selection): string {
  return selection.kind === 'dm' ? dmRoom(selection.id) : selection.id;
}

export function App() {
  const [state, setState] = useState<State | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  async function refresh() {
    const next = await api.state();
    setState(next);
    setSelection((current) => current ?? (next.groups[0] ? { kind: 'group', id: next.groups[0].id } : next.bots[0] ? { kind: 'dm', id: next.bots[0].id } : null));
    return next;
  }

  useEffect(() => {
    refresh().catch((err) => setError(String(err.message ?? err)));
  }, []);

  useEffect(() => {
    if (!selection) return;
    api.messages(roomIdOf(selection))
      .then((result) => setMessages(result.messages))
      .catch((err) => setError(String(err.message ?? err)));
  }, [selection]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  const bots = state?.bots ?? [];
  const groups = state?.groups ?? [];
  const activeGroup = selection?.kind === 'group' ? groups.find((g) => g.id === selection.id) ?? null : null;
  const activeBot = selection?.kind === 'dm' ? bots.find((b) => b.id === selection.id) ?? null : null;
  const members = useMemo(() => (activeGroup ? activeGroup.members.map((id) => bots.find((b) => b.id === id)).filter((b): b is Bot => Boolean(b)) : []), [activeGroup, bots]);

  async function send() {
    const text = draft.trim();
    if (!text || !selection || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.send(roomIdOf(selection), text);
      setMessages(result.messages);
      setDraft('');
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" /> <strong>3end-bot</strong>
        </div>
        {state && (
          <div className={state.model.configured ? 'model ok' : 'model mock'}>
            {state.model.configured ? `模型：${state.model.model}` : 'mock 模式（.env 配置 USER_LLM_*）'}
          </div>
        )}
        <section>
          <h2>群聊</h2>
          {groups.map((group) => (
            <button
              key={group.id}
              className={selection?.kind === 'group' && selection.id === group.id ? 'row active' : 'row'}
              onClick={() => setSelection({ kind: 'group', id: group.id })}
            >
              <span># {group.name}</span>
              <small>{group.members.length} 人</small>
            </button>
          ))}
          {groups.length === 0 && <p className="muted">暂无群聊</p>}
        </section>
        <section>
          <h2>单聊</h2>
          {bots.map((bot) => (
            <button
              key={bot.id}
              className={selection?.kind === 'dm' && selection.id === bot.id ? 'row active' : 'row'}
              onClick={() => setSelection({ kind: 'dm', id: bot.id })}
            >
              <span>{bot.main ? '★ ' : ''}{bot.name}</span>
              <small>{bot.role || '成员'}</small>
            </button>
          ))}
        </section>
        <button className="ghost" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? '收起' : '+ 新建'}
        </button>
        {showCreate && state && (
          <CreatePanel
            bots={bots}
            onBot={async (input) => { await api.createBot(input); await refresh(); }}
            onGroup={async (input) => { await api.createGroup(input); const next = await refresh(); setSelection({ kind: 'group', id: next.groups.at(-1)!.id }); }}
          />
        )}
      </aside>

      <main className="chat">
        <header>
          <h1>
            {activeGroup ? `# ${activeGroup.name}` : activeBot ? activeBot.name : '选择一个会话'}
          </h1>
          {activeGroup && <p className="muted">{activeGroup.notice || '主管先答，需要谁再 @ 谁'}</p>}
          {activeBot?.instructions && <p className="muted">{activeBot.instructions}</p>}
        </header>
        {error && <div className="error">{error}</div>}
        <div className="timeline" ref={scroller}>
          {messages.length === 0 && <p className="muted empty">还没有消息，发一句话试试。</p>}
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} bots={bots} />
          ))}
          {busy && <p className="muted typing">团队正在输入…</p>}
        </div>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          disabled={!selection || busy}
          members={members}
        />
      </main>
    </div>
  );
}

function MessageRow({ message, bots }: { message: RoomMessage; bots: Bot[] }) {
  const isUser = message.authorId === 'user';
  const bot = bots.find((b) => b.id === message.authorId);
  if (message.kind === 'pass') {
    return <div className="pass">{message.authorName} 保持沉默 [PASS]</div>;
  }
  return (
    <div className={isUser ? 'msg user' : 'msg bot'}>
      <div className="who">{isUser ? '你' : `${message.authorName}${bot?.role ? ` · ${bot.role}` : ''}`}</div>
      <div className="text">{message.text}</div>
    </div>
  );
}

function Composer({
  value, onChange, onSend, disabled, members,
}: {
  value: string;
  onChange: (_value: string) => void;
  onSend: () => void;
  disabled: boolean;
  members: Bot[];
}) {
  const [matches, setMatches] = useState<Bot[]>([]);

  function update(next: string) {
    onChange(next);
    const at = next.lastIndexOf('@');
    const tail = at === -1 ? '' : next.slice(at + 1);
    const typed = /^[\p{L}\p{N}_-]*$/u.test(tail) ? tail : '';
    setMatches(at === -1 || typed === '' ? [] : members.filter((b) => b.name.toLowerCase().startsWith(typed.toLowerCase())));
  }

  function pick(bot: Bot) {
    const at = value.lastIndexOf('@');
    onChange(`${value.slice(0, at)}@${bot.name} `);
    setMatches([]);
  }

  return (
    <div className="composer">
      {matches.length > 0 && (
        <ul className="autocomplete">
          {matches.map((bot) => (
            <li key={bot.id}>
              <button onClick={() => pick(bot)}>@{bot.name} <small>{bot.role}</small></button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        placeholder="发消息，@ 呼叫成员。Enter 发送，Shift+Enter 换行。"
        value={value}
        onChange={(event) => update(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      <button className="send" onClick={onSend} disabled={disabled || value.trim() === ''}>发送</button>
    </div>
  );
}

function CreatePanel({
  bots, onBot, onGroup,
}: {
  bots: Bot[];
  onBot: (_input: { name: string; role?: string; instructions?: string }) => Promise<void>;
  onGroup: (_input: { name: string; admin: string; members: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [instructions, setInstructions] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <div className="create">
      <h3>新建 Bot</h3>
      <input placeholder="名字（必填）" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="角色" value={role} onChange={(e) => setRole(e.target.value)} />
      <textarea placeholder="指令" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      <button
        className="send"
        disabled={!name.trim()}
        onClick={async () => { await onBot({ name, role, instructions }); setName(''); setRole(''); setInstructions(''); }}
      >
        创建 Bot
      </button>

      <h3>新建群聊</h3>
      <input placeholder="群名" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
      <div className="chips">
        {bots.map((bot) => (
          <label key={bot.id}>
            <input
              type="checkbox"
              checked={selected.includes(bot.id)}
              onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, bot.id] : prev.filter((id) => id !== bot.id)))}
            />
            {bot.name}
          </label>
        ))}
      </div>
      <button
        className="send"
        disabled={selected.length === 0}
        onClick={async () => { await onGroup({ name: groupName || 'Group', admin: selected[0], members: selected }); setGroupName(''); setSelected([]); }}
      >
        创建群聊
      </button>
    </div>
  );
}
