// Tasks: what people asked for on your calls, grouped by person. Tick to complete; the latest done ones stay below.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { shortDate, toggleTask } from '../memory';
import { useSettings } from '../settings';
import { useTheme } from '../theme';
import { Screen, ui } from '../ui';

export default function Tasks() {
  const t = useTheme();
  const { settings, update } = useSettings();
  if (!settings) return null;
  const open = settings.tasks.filter((x) => !x.done);
  const done = settings.tasks.filter((x) => x.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')).slice(0, 20);
  const people = [...new Set(open.map((x) => x.personName))];

  const row = (task) => (
    <Pressable key={task.id} onPress={() => update(toggleTask(task.id))}
      style={[styles.row, { backgroundColor: t.card, borderColor: task.done ? t.line : t.sage }]}
      accessibilityRole="checkbox" accessibilityState={{ checked: task.done }}>
      <View style={[styles.check, { borderColor: task.done ? t.line : t.sage, backgroundColor: task.done ? t.line : 'transparent' }]}>
        {task.done && <Text style={{ color: t.paper, fontWeight: '800' }}>✓</Text>}
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: task.done ? t.muted : t.ink, textDecorationLine: task.done ? 'line-through' : 'none' }]}>{task.title}</Text>
        <Text style={[styles.sub, { color: t.muted }]}>
          {[task.done ? task.personName : null, task.due_date, task.due_time, `from ${shortDate(task.createdAt)}`].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10}><Text style={{ color: t.clay, fontWeight: '600', fontSize: 16 }}>‹ Back</Text></Pressable>
      <Text style={[ui.title, { color: t.ink }]}>Tasks</Text>
      <Text style={[ui.lede, { color: t.muted }]}>Things people asked for on your calls. Tick them off as you go.</Text>
      {!open.length && (
        <Text style={[styles.sub, { color: t.muted, fontSize: 15 }]}>Nothing open. Tasks from your after-call notes show up here.</Text>
      )}
      {people.map((name) => (
        <View key={name} style={styles.group}>
          <Text style={[ui.section, { color: t.muted }]}>{name}</Text>
          {open.filter((x) => x.personName === name).map(row)}
        </View>
      ))}
      {done.length > 0 && (
        <View style={styles.group}>
          <Text style={[ui.section, { color: t.muted }]}>Done</Text>
          {done.map(row)}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  check: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, lineHeight: 18 },
});
