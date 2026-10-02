// Your call notes as plain text (Markdown), to send anywhere through Android's share sheet: the Claude app, email,
// Drive, Keep. Krypu itself sends nothing; you pick where it goes.
import { Share } from 'react-native';
import { dueLabel } from './memory';
import { PLATFORMS } from './platforms';

const when = (iso) => new Date(iso).toLocaleString(undefined,
  { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const how = (platform) => (platform === 'phone' ? 'Phone call' : PLATFORMS[platform]?.label ?? 'Call');

// All notes, or with `personId` just that person (and with `latest` only their newest call).
export function notesText(settings, people = [], { personId, latest } = {}) {
  const nameOf = (id) => people.find((p) => p.id === id)?.name
    ?? settings.calls[id]?.find((c) => c.name)?.name
    ?? settings.tasks.find((x) => x.personId === id)?.personName
    ?? settings.hidden?.[id] ?? 'Someone';
  const lastAt = (id) => settings.calls[id]?.[0]?.at ?? '';
  const ids = personId ? [personId]
    : [...new Set([...Object.keys(settings.calls), ...Object.keys(settings.notes), ...settings.tasks.filter((x) => !x.done).map((x) => x.personId)])]
        .sort((a, b) => lastAt(b).localeCompare(lastAt(a)));

  const out = [personId ? `# Krypu: call with ${nameOf(personId)}` : `# Krypu call notes (${when(new Date().toISOString())})`];
  for (const id of ids) {
    const calls = (settings.calls[id] ?? []).slice(0, latest ? 1 : undefined);
    const tasks = settings.tasks.filter((x) => x.personId === id && !x.done);
    const notes = settings.notes[id];
    if (!calls.length && !tasks.length && !notes) continue;
    if (!personId) out.push('', `## ${nameOf(id)}`);
    for (const c of calls) {
      out.push('', `### ${when(c.at)} · ${how(c.platform)}`);
      if (c.note) out.push(...c.note.split('\n').filter(Boolean).map((l) => `- ${l}`));
      const open = c.followUps.filter((f) => !f.done);
      if (open.length) out.push('Ask next time:', ...open.map((f) => `- ${f.text}`));
    }
    if (tasks.length) out.push('', 'Open tasks:', ...tasks.map((x) => `- ${x.title}${dueLabel(x) ? ` (${dueLabel(x)})` : ''}`));
    if (notes && !latest) out.push('', 'Notes:', notes);
  }
  if (out.length === 1) out.push('', 'No call notes yet.');
  return out.join('\n');
}

export function shareNotes(message) {
  return Share.share({ message, title: 'Krypu notes' });
}
