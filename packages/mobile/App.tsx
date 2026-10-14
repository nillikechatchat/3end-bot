// Mobile end — a thin client over the same standalone server as web and desktop.
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { api, dmRoom, type Bot, type Group, type RoomMessage, type State } from './src/api.ts';

type Selection = { kind: 'group'; id: string } | { kind: 'dm'; id: string };
const roomIdOf = (s: Selection) => (s.kind === 'dm' ? dmRoom(s.id) : s.id);

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.state()
      .then((next) => {
        setState(next);
        if (next.groups[0]) setSelection({ kind: 'group', id: next.groups[0].id });
        else if (next.bots[0]) setSelection({ kind: 'dm', id: next.bots[0].id });
      })
      .catch((err) => setError(String(err.message ?? err)));
  }, []);

  useEffect(() => {
    if (!selection) return;
    api.messages(roomIdOf(selection)).then((r) => setMessages(r.messages)).catch((err) => setError(String(err.message ?? err)));
  }, [selection]);

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

  const bots = state?.bots ?? [];
  const groups = state?.groups ?? [];
  const activeGroup = selection?.kind === 'group' ? groups.find((g) => g.id === selection.id) : undefined;
  const activeBot = selection?.kind === 'dm' ? bots.find((b) => b.id === selection.id) : undefined;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{activeGroup ? `# ${activeGroup.name}` : activeBot?.name ?? '3end-bot'}</Text>
        <Text style={styles.sub}>{state?.model.configured ? `模型 ${state.model.model}` : 'mock 模式'} · {api.base}</Text>
      </View>

      <View style={styles.chips}>
        {groups.map((group: Group) => (
          <Pressable
            key={group.id}
            onPress={() => setSelection({ kind: 'group', id: group.id })}
            style={[styles.chip, selection?.kind === 'group' && selection.id === group.id && styles.chipActive]}
          >
            <Text style={styles.chipText}># {group.name}</Text>
          </Pressable>
        ))}
        {bots.map((bot: Bot) => (
          <Pressable
            key={bot.id}
            onPress={() => setSelection({ kind: 'dm', id: bot.id })}
            style={[styles.chip, selection?.kind === 'dm' && selection.id === bot.id && styles.chipActive]}
          >
            <Text style={styles.chipText}>{bot.name}</Text>
          </Pressable>
        ))}
      </View>

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.muted}>还没有消息。</Text>}
        renderItem={({ item }) => (
          item.kind === 'pass'
            ? <Text style={styles.pass}>{item.authorName} 保持沉默 [PASS]</Text>
            : (
              <View style={[styles.msg, item.authorId === 'user' ? styles.msgUser : styles.msgBot]}>
                <Text style={styles.who}>{item.authorId === 'user' ? '你' : item.authorName}</Text>
                <Text style={styles.text}>{item.text}</Text>
              </View>
            )
        )}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="发消息，@ 呼叫成员"
            placeholderTextColor="#8b93a3"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable style={[styles.send, (busy || draft.trim() === '') && styles.sendDisabled]} onPress={send} disabled={busy || draft.trim() === ''}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>发送</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1115' },
  header: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#2a2f3a' },
  title: { color: '#e6e8ee', fontSize: 16, fontWeight: '600' },
  sub: { color: '#8b93a3', fontSize: 11, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10 },
  chip: { borderWidth: 1, borderColor: '#2a2f3a', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#5b8cff', borderColor: '#5b8cff' },
  chipText: { color: '#e6e8ee', fontSize: 12 },
  list: { flex: 1 },
  listContent: { padding: 12, gap: 10 },
  msg: { maxWidth: '88%', borderRadius: 10, padding: 10 },
  msgUser: { alignSelf: 'flex-end', backgroundColor: '#5b8cff' },
  msgBot: { alignSelf: 'flex-start', backgroundColor: '#1c2129', borderWidth: 1, borderColor: '#2a2f3a' },
  who: { color: '#8b93a3', fontSize: 11, marginBottom: 3 },
  text: { color: '#e6e8ee' },
  pass: { color: '#8b93a3', fontStyle: 'italic', fontSize: 12 },
  muted: { color: '#8b93a3', textAlign: 'center', marginTop: 20 },
  error: { color: '#ff8a8a', paddingHorizontal: 12 },
  composer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#2a2f3a' },
  input: { flex: 1, backgroundColor: '#1e222b', borderWidth: 1, borderColor: '#2a2f3a', borderRadius: 10, padding: 10, color: '#e6e8ee', maxHeight: 120 },
  send: { backgroundColor: '#5b8cff', borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#fff' },
});
