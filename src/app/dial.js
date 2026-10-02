// Dial pad: type a number like on the phone's own keypad. As you type, matching contacts are suggested - by number, or
// by the letters on the keys (7267 → "Sams"). Calling opens the phone app; when you come back, Krypu asks for notes.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useContacts } from '../contacts';
import { callPhone } from '../launch';
import { useSettings } from '../settings';
import { useTheme } from '../theme';

const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
              ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
const T9 = Object.fromEntries(KEYS.flatMap(([d, letters]) => [...letters.toLowerCase()].map((c) => [c, d])));
const digits = (s) => (s ?? '').replace(/\D/g, '');
// "Sam's Club" → ["7267", "22582"]: each word as key presses, to match against what was typed
const t9Words = (name) => name.toLowerCase().split(/[^a-z]+/).filter(Boolean).map((w) => [...w].map((c) => T9[c] ?? '').join(''));

// 8434457179 → (843) 445-7179 as you type; anything else is shown as typed
function pretty(n) {
  if (n.startsWith('+') || /[*#]/.test(n) || n.length > 10) return n;
  if (n.length <= 3) return n;
  if (n.length <= 6) return `(${n.slice(0, 3)}) ${n.slice(3)}`;
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}

export default function Dial() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { update } = useSettings();
  const contacts = useContacts();
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');

  const typed = digits(number);
  const matches = useMemo(() => {
    if (!typed) return [];
    return contacts.people.filter((p) => p.phone)
      .map((p) => {
        const d = digits(p.phone);
        const byNumber = d.includes(typed);
        const byName = t9Words(p.name).some((w) => w.startsWith(typed));
        return (byNumber || byName) ? { p, rank: (d.endsWith(typed) || d.slice(-10).startsWith(typed) ? 0 : 1) + (byName ? 0 : 0.5) } : null;
      })
      .filter(Boolean).sort((a, b) => a.rank - b.rank).slice(0, 5).map((x) => x.p);
  }, [typed, contacts.people]);
  const exact = contacts.people.find((p) => p.phone && typed.length >= 7 && digits(p.phone).slice(-10) === typed.slice(-10));

  const call = (person) => {
    // remembered on the phone, so the notes box comes up when you're back (even if Android closed Krypu meanwhile)
    update({ pendingCall: { person: { id: person.id, name: person.name, phone: person.phone, links: {}, platforms: [] }, at: new Date().toISOString() } });
    router.back();
    callPhone(person).catch(() => {});
  };
  const callTyped = () => {
    if (!number) return;
    call(exact ?? { id: `tel:${typed}`, name: name.trim() || pretty(number), phone: number });
  };
  const press = (k) => setNumber((n) => (n + k).slice(0, 20));

  return (
    <View style={[styles.root, { backgroundColor: t.paper, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Text style={{ color: t.clay, fontWeight: '600', fontSize: 16 }}>‹ Back</Text>
      </Pressable>

      <ScrollView style={styles.flex} contentContainerStyle={styles.top} keyboardShouldPersistTaps="handled">
        {matches.map((p) => (
          <Pressable key={p.id} onPress={() => call(p)} style={[styles.match, { backgroundColor: t.card, borderColor: t.line }]}>
            <View style={[styles.avatar, { backgroundColor: t.claySoft }]}>
              <Text style={{ color: t.clay, fontWeight: '700', fontSize: 18 }}>{p.name[0]}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.matchName, { color: t.ink }]} numberOfLines={1}>{p.name}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>{p.phone}</Text>
            </View>
            <Text style={{ color: t.sage, fontSize: 22 }}>✆</Text>
          </Pressable>
        ))}
        {typed.length >= 7 && !exact && (
          <TextInput value={name} onChangeText={setName} placeholder="Who is it? (optional, for your notes)" placeholderTextColor={t.muted}
            style={[styles.nameInput, { borderColor: t.line, color: t.ink, backgroundColor: t.card }]} />
        )}
      </ScrollView>

      <Text style={[styles.number, { color: number ? t.ink : t.muted }]} numberOfLines={1} adjustsFontSizeToFit>
        {number ? pretty(number) : 'Enter a number'}
      </Text>

      <View style={styles.pad}>
        {KEYS.map(([d, letters]) => (
          <Pressable key={d} onPress={() => press(d)} onLongPress={d === '0' ? () => press('+') : undefined}
            style={({ pressed }) => [styles.key, { backgroundColor: pressed ? t.line : t.card }]}>
            <Text style={[styles.keyDigit, { color: t.ink }]}>{d}</Text>
            {!!letters && <Text style={[styles.keyLetters, { color: t.muted }]}>{letters}</Text>}
          </Pressable>
        ))}
      </View>

      <View style={styles.bottom}>
        <View style={styles.side} />
        <Pressable onPress={callTyped} disabled={!number} accessibilityLabel="Call"
          style={[styles.callBtn, { backgroundColor: number ? t.sage : t.line }]}>
          <Text style={{ color: t.paper, fontSize: 30 }}>✆</Text>
        </Pressable>
        <Pressable onPress={() => setNumber((n) => n.slice(0, -1))} onLongPress={() => setNumber('')} disabled={!number}
          accessibilityLabel="Delete" style={styles.side}>
          {!!number && <Text style={{ color: t.muted, fontSize: 26 }}>⌫</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  flex: { flex: 1 },
  back: { alignSelf: 'flex-start', paddingVertical: 6 },
  top: { gap: 8, paddingVertical: 8, justifyContent: 'flex-end', flexGrow: 1 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  matchName: { fontSize: 16, fontWeight: '600' },
  nameInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  number: { fontSize: 34, textAlign: 'center', marginVertical: 14, fontVariant: ['tabular-nums'] },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, maxWidth: 360, width: '100%', alignSelf: 'center' },
  key: { width: '30%', aspectRatio: 1.6, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  keyDigit: { fontSize: 30, fontWeight: '500' },
  keyLetters: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginTop: -2 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', maxWidth: 360, width: '100%', alignSelf: 'center', marginTop: 14 },
  side: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  callBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
