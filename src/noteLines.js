// Call notes as separate lines, each with what to do with it: follow up (a task to ask about it next time),
// schedule (a calendar event + task, day/time read from the line) or note (kept on the person's notes).
// Enter adds a line. Krypu guesses the kind; tap a chip to change it.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_RE = /\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/i;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\bat (\d{1,2})(?::(\d{2}))?\b/i;
const NEWS_RE = /\b(sick|ill|flu|covid|cold|hospital|surgery|doctor|dentist|appointment|interview|exam|test|trip|travel|moving|pregnan|baby|hurt|broke|injur|funeral|job)/i;

// Next date for a line like "saturday", "tomorrow", "next week"; null if it names no day.
export function parseWhen(text, now = new Date()) {
  const d = new Date(now);
  const lower = text.toLowerCase();
  let found = true;
  if (/\btomorrow\b/.test(lower)) d.setDate(d.getDate() + 1);
  else if (/\btonight\b|\btoday\b/.test(lower)) { /* today */ }
  else if (/\bnext week\b/.test(lower)) d.setDate(d.getDate() + 7);
  else {
    const m = lower.match(DAY_RE);
    if (m) {
      const idx = DAYS.findIndex((x) => x.startsWith(m[1].slice(0, 3)));
      d.setDate(d.getDate() + (((idx - d.getDay() + 7) % 7) || 7));
    } else found = false;
  }
  const t = text.match(TIME_RE);
  let time = null;
  if (t) {
    let h = +(t[1] ?? t[4]); const min = t[2] ?? t[5] ?? '00'; const ap = t[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    if (!ap && h < 8) h += 12;                              // "at 3" means 3 pm
    time = `${String(h).padStart(2, '0')}:${min}`;
  }
  if (!found && !time) return null;
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { date, time };
}

export function guessKind(text) {
  if (parseWhen(text) || /\b(go to|visit|meet|pick up|drop off)\b/i.test(text)) return 'schedule';
  if (NEWS_RE.test(text)) return 'followup';
  return 'note';
}

export const lineItem = (text) => ({ text: text.trim(), kind: guessKind(text) });
export const itemsFromNote = (note) => (note ?? '').split('\n').map((x) => x.trim()).filter(Boolean).map(lineItem);

const KINDS = [
  { key: 'followup', label: 'Follow up', tone: 'sage' },
  { key: 'schedule', label: 'Schedule', tone: 'clay' },
  { key: 'note', label: 'Note', tone: 'muted' },
];

export function whenLabel(text) {
  const w = parseWhen(text);
  if (!w) return 'tomorrow, all day';
  const d = new Date(`${w.date}T12:00:00`);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (!w.time) return `${day}, all day`;
  const [h, m] = w.time.split(':').map(Number);
  return `${day}, ${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

// The list of lines with their chips, plus the box you type the next line into (Enter adds it).
export function NoteLines({ items, onChange, t, placeholder, autoFocus, compact }) {
  const [draft, setDraft] = useState('');
  const add = () => { if (draft.trim()) onChange([...items, lineItem(draft)]); setDraft(''); };
  const setKind = (i, kind) => onChange(items.map((x, j) => (j === i ? { ...x, kind } : x)));
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  return (
    <View style={styles.wrap}>
      {items.map((x, i) => (
        <View key={i} style={[styles.item, { backgroundColor: t.paper, borderColor: t.line }]}>
          <View style={styles.itemTop}>
            <Text style={[styles.text, { color: t.ink }]}>{x.text}</Text>
            <Pressable onPress={() => remove(i)} hitSlop={10} accessibilityLabel={`Remove: ${x.text}`}>
              <Text style={{ color: t.muted, fontSize: 18 }}>×</Text>
            </Pressable>
          </View>
          <View style={styles.chips}>
            {KINDS.map((k) => {
              const on = x.kind === k.key;
              return (
                <Pressable key={k.key} onPress={() => setKind(i, k.key)}
                  style={[styles.chip, { borderColor: on ? t[k.tone] : t.line, backgroundColor: on ? t[k.tone] : 'transparent' }]}>
                  <Text style={[styles.chipText, { color: on ? t.paper : t.muted }]}>{k.label}</Text>
                </Pressable>
              );
            })}
            {x.kind === 'schedule' && !compact && <Text style={[styles.when, { color: t.clay }]}>{whenLabel(x.text)}</Text>}
          </View>
        </View>
      ))}
      <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={add} submitBehavior="submit" blurOnSubmit={false}
        returnKeyType="done" autoFocus={autoFocus} placeholder={placeholder} placeholderTextColor={t.muted}
        onBlur={add} style={[styles.input, { backgroundColor: t.paper, borderColor: t.line, color: t.ink }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  item: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  itemTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  text: { flex: 1, fontSize: 15, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  chipText: { fontSize: 13, fontWeight: '700' },
  when: { fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
