// Helpers over what Krypu remembers (settings.tasks / settings.calls): record a call, read a person's history.
const id = () => Math.random().toString(36).slice(2, 10);

// Store one call's note + what was found in it. Returns the updater for settings.update().
export function recordCall({ person, platform, note, found }) {
  return (s) => ({
    ...s,
    calls: {
      ...s.calls,
      [person.id]: [{
        id: id(), at: new Date().toISOString(), platform, note,
        followUps: found.follow_ups.map((text) => ({ text, done: false })),
        facts: found.facts,
      }, ...(s.calls[person.id] ?? [])],
    },
  });
}

// Add the tasks you kept to Krypu's task list.
export function addTasks({ person, tasks }) {
  return (s) => ({
    ...s,
    tasks: [...tasks.map((t) => ({ ...t, id: id(), personId: person.id, personName: person.name, done: false,
                                   createdAt: new Date().toISOString() })), ...s.tasks],
  });
}

export function toggleTask(taskId) {
  return (s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done, doneAt: t.done ? null : new Date().toISOString() } : t)) });
}

export function markAsked(personId, callId, index) {
  return (s) => ({
    ...s,
    calls: { ...s.calls, [personId]: s.calls[personId].map((c) =>
      (c.id === callId ? { ...c, followUps: c.followUps.map((f, i) => (i === index ? { ...f, done: true } : f)) } : c)) },
  });
}

// What to show before calling someone: open follow-ups, everything known about them, open tasks, recent calls.
export function personMemory(settings, personId) {
  const calls = settings.calls[personId] ?? [];
  return {
    calls,
    followUps: calls.flatMap((c) => c.followUps.map((f, i) => ({ ...f, callId: c.id, index: i, at: c.at })).filter((f) => !f.done)),
    facts: [...new Set(calls.flatMap((c) => c.facts))],
    tasks: settings.tasks.filter((t) => t.personId === personId && !t.done),
  };
}

export function shortDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// "Sat, Oct 3" or "Sat, Oct 3, 7 pm" for a task's due date/time; '' if none.
export function dueLabel(task) {
  if (!task.due_date) return '';
  const day = new Date(`${task.due_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (!task.due_time) return day;
  const [h, m] = task.due_time.split(':').map(Number);
  return `${day}, ${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}
