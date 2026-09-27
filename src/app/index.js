// Home: your contacts, filtered to people you can video-call on the apps you use.
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { canSplit } from '../callTab';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { analyzeNote } from '../ai';
import { detectPlatform } from '../platforms';
import { HOSTABLE } from '../myRooms';
import { saveTasks, TASK_TARGETS } from '../saveTasks';
import { addTasks, markAsked, personMemory, recordCall, shortDate, toggleTask } from '../memory';
import { getAiKey } from '../secret';
import { PLATFORMS } from '../platforms';
import * as Clipboard from 'expo-clipboard';
import { deleteContact, saveLink, useContacts } from '../contacts';
import { collectNewLinks } from '../messages';
import { askText, callPhone, inviteText, nudgeText, openRoom, openTheirs, text } from '../launch';
import { useSettings } from '../settings';
import { useTheme } from '../theme';
import { guessZone, localTime, useNow, ZONE_CHOICES, zoneName } from '../timezones';
import { Chip, Screen, ui, UpdateBanner } from '../ui';

function Person({ person, t, onPress, picking, picked, broken, note, zone, now, iphone, asked }) {
  // iPhone people stand out: blue avatar instead of clay
  const tone = iphone ? 'sky' : 'clay';
  const none = person.platforms.length === 0;
  return (
    <Pressable onPress={onPress}
      style={[styles.card, { backgroundColor: t.card, borderColor: picked ? t.moss : t.line }, picked && styles.picked]}>
      <View style={[styles.avatar, { backgroundColor: t[`${tone}Soft`] }]}>
        <Text style={[styles.avatarText, { color: t[tone] }]}>{person.name[0]}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.name, { color: t.ink }]}>{person.name}</Text>
        <LocalTime zone={zone} t={t} now={now} style={styles.timeLine} />
        <View style={ui.chips}>
          {iphone && !person.platforms.includes('facetime') && (
            <View style={[ui.chip, { backgroundColor: t.skySoft }]}>
              <Text style={[ui.chipText, { color: t.sky }]}>{asked ? 'iPhone · asked' : 'iPhone'}</Text>
            </View>
          )}
          {none
            ? (!iphone && <Text style={[styles.sub, { color: t.muted }]}>No video links yet</Text>)
            : person.platforms.map((p) => <Chip key={p} platform={p} t={t} broken={broken.has(`${person.id}:${p}`)} />)}
        </View>
        {!!note && <Text style={[styles.sub, { color: t.muted, fontStyle: 'italic' }]} numberOfLines={1}>{note}</Text>}
      </View>
      {picking
        ? <View style={[styles.check, { borderColor: picked ? t.moss : t.line, backgroundColor: picked ? t.moss : 'transparent' }]}>
            {picked && <Text style={[styles.checkMark, { color: t.paper }]}>✓</Text>}
          </View>
        : <Text style={[styles.chev, { color: t.muted }]}>›</Text>}
    </Pressable>
  );
}

function zoneFor(person, settings) {
  return settings.tz[person.id] ?? guessZone(person.phone);
}

// "11:40 PM in Milan" line; moon + clay colour when it's night there
function LocalTime({ zone, t, now, style }) {
  if (!zone) return null;
  const { time, night } = localTime(zone, now);
  return (
    <Text style={[styles.sub, styles.time, { color: night ? t.clay : t.muted }, style]} numberOfLines={1}>
      {`${night ? '☾ ' : ''}${time} in ${zoneName(zone)}`}
    </Text>
  );
}

// Time zone row in the sheet: shows the guess, tap to pick another
function ZonePicker({ person, t }) {
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const zone = zoneFor(person, settings);
  const set = (z) => { update((s) => ({ ...s, tz: { ...s.tz, [person.id]: z } })); setOpen(false); };
  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={() => setOpen(!open)} hitSlop={6}>
        <Text style={[styles.sub, { color: t.muted }]}>
          Time zone: {zone ? zoneName(zone) : 'unknown'}{settings.tz[person.id] ? '' : zone ? ' (from their number)' : ''} ·{' '}
          <Text style={{ color: t.clay, fontWeight: '700' }}>{open ? 'Done' : 'Change'}</Text>
        </Text>
      </Pressable>
      {open && (
        <View style={ui.chips}>
          {ZONE_CHOICES.map((z) => (
            <Pressable key={z} onPress={() => set(z)}
              style={[ui.chip, { backgroundColor: z === zone ? t.claySoft : t.card, borderWidth: 1, borderColor: t.line }]}>
              <Text style={[ui.chipText, { color: z === zone ? t.clay : t.muted }]}>{zoneName(z)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// Private note about a person, saved as you type (closing the sheet can skip onBlur on Android).
function PersonNote({ person, t }) {
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState(settings.notes[person.id] ?? '');
  const change = (v) => {
    setDraft(v);
    update((s) => ({ ...s, notes: { ...s.notes, [person.id]: v.trim() || undefined } }));
  };
  return (
    <TextInput value={draft} onChangeText={change} multiline
      placeholder="Best time to call, time zone, kids' names…" placeholderTextColor={t.muted}
      style={[styles.note, { backgroundColor: t.card, borderColor: t.line, color: t.ink }]} />
  );
}

// Paste a video link someone sent you; it's saved onto their contact card.
function AddLink({ person, t, onSaved }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    try { const platform = await saveLink(person, url.trim()); setUrl(''); setError(''); onSaved(platform, url.trim()); }
    catch (e) { setError(e.message); }
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.rowGap}>
        <TextInput value={url} onChangeText={(v) => { setUrl(v); setError(''); }} autoCapitalize="none" autoCorrect={false}
          placeholder="Paste a link they sent you" placeholderTextColor={t.muted}
          style={[styles.search, { flex: 1, backgroundColor: t.card, borderColor: error ? t.clay : t.line, color: t.ink }]} />
        {!!url.trim() && (
          <Pressable onPress={save} style={[styles.saveBtn, { backgroundColor: t.clay }]}>
            <Text style={[ui.primaryText, { color: t.onClay }]}>Save</Text>
          </Pressable>
        )}
      </View>
      {!!error && <Text style={[styles.sub, { color: t.clay }]}>{error}</Text>}
    </View>
  );
}

function Option({ t, tone, title, how, dashed, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.option, dashed ? [styles.mine, { borderColor: t[tone] }] : { backgroundColor: t.card, borderColor: t.line }]}>
      <View style={[ui.dot, { backgroundColor: t[tone] }]} />
      <View style={styles.cardBody}>
        <Text style={[styles.name, { color: t.ink }]}>{title}</Text>
        <Text style={[styles.sub, { color: t.muted }]}>{how}</Text>
      </View>
    </Pressable>
  );
}

// What Krypu remembers about someone, shown at the top of their sheet: things to ask about, facts, open tasks, calls.
function BeforeYouCall({ person, t }) {
  const { settings, update } = useSettings();
  const m = personMemory(settings, person.id);
  if (!m.followUps.length && !m.facts.length && !m.tasks.length && !m.calls.length) return null;
  return (
    <View style={[styles.rooms, { backgroundColor: t.card, borderColor: t.sage }]}>
      <Text style={[ui.section, { color: t.sage, marginTop: 0 }]}>Before you call</Text>
      {m.followUps.map((f) => (
        <View key={`${f.callId}-${f.index}`} style={styles.memRow}>
          <Text style={[styles.sub, styles.flex, { color: t.ink, fontSize: 15, lineHeight: 21 }]}>{f.text}</Text>
          <Pressable onPress={() => update(markAsked(person.id, f.callId, f.index))} hitSlop={8}
            style={[styles.askedBtn, { borderColor: t.sage }]} accessibilityLabel={`Mark asked: ${f.text}`}>
            <Text style={{ color: t.sage, fontWeight: '700', fontSize: 13 }}>Asked ✓</Text>
          </Pressable>
        </View>
      ))}
      {m.facts.length > 0 && (
        <View style={ui.chips}>
          {m.facts.map((f) => (
            <View key={f} style={[ui.chip, { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: t.paper, borderWidth: 1, borderColor: t.line }]}>
              <Text style={[ui.chipText, { color: t.ink }]}>{f}</Text>
            </View>
          ))}
        </View>
      )}
      {m.tasks.map((task) => (
        <Pressable key={task.id} onPress={() => update(toggleTask(task.id))} style={styles.memRow}>
          <View style={[styles.smallCheck, { borderColor: t.clay }]} />
          <Text style={[styles.sub, styles.flex, { color: t.ink, fontSize: 15 }]}>
            {task.title}{task.due_date ? `  ·  ${task.due_date}` : ''}
          </Text>
        </Pressable>
      ))}
      {m.calls.slice(0, 3).map((c) => (
        <Text key={c.id} style={[styles.sub, { color: t.muted }]} numberOfLines={2}>
          {shortDate(c.at)} · {PLATFORMS[c.platform]?.label ?? 'Call'}{c.note ? ` · ${c.note}` : ''}
        </Text>
      ))}
    </View>
  );
}

function PlatformSheet({ person, rooms, t, onClose, onLaunch, onAsk, onLinkSaved, onHide, onDelete }) {
  const { settings } = useSettings();
  const now = useNow();
  const insets = useSafeAreaInsets();
  if (!person) return null;
  const zone = zoneFor(person, settings);
  const late = zone && localTime(zone, now).night;
  const enabled = settings.enabled;
  // WhatsApp needs no link: anyone with a phone number might have it
  const whatsappByNumber = enabled.whatsapp && person.phone && !person.platforms.includes('whatsapp');
  const askable = ['facetime', 'zoom', 'meet', 'teams', 'slack'].filter((k) => enabled[k] && !person.platforms.includes(k));
  const voice = [
    person.phone && { key: 'phone', label: 'Phone call', how: `Opens your dialer with ${person.phone}.`, tone: 'clay' },
    person.phone && enabled.whatsapp && { key: 'whatsapp-voice', label: 'WhatsApp', how: 'Opens your WhatsApp chat with them - tap the phone icon there to call.', tone: 'sage' },
  ].filter(Boolean);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: t.scrim }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.paper, borderColor: t.line }]}>
          <ScrollView contentContainerStyle={[styles.sheetBody, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sheetTitle, { color: t.ink }]}>Call {person.name}</Text>
          {!!person.phone && <Text style={[styles.sub, { color: t.muted, marginTop: -8 }]}>{person.phone}</Text>}
          <LocalTime zone={zone} t={t} now={now} style={{ fontSize: 15, fontWeight: '600' }} />
          {late && (
            <View style={[styles.warn, { backgroundColor: t.claySoft }]}>
              <Text style={[styles.sub, { color: t.clay }]}>
                It's late for {person.name}. Maybe send a message first, or call tomorrow.
              </Text>
            </View>
          )}
          <ZonePicker person={person} t={t} />
          <BeforeYouCall person={person} t={t} />

          <Text style={[ui.section, { color: t.muted }]}>Video</Text>
          {person.platforms.map((p) => (
            <Option key={p} t={t} tone={PLATFORMS[p].tone} title={PLATFORMS[p].label} how={PLATFORMS[p].how} onPress={() => onLaunch(p, false)} />
          ))}
          {whatsappByNumber && (
            <Option t={t} tone="sage" title="WhatsApp" how="If they have WhatsApp: opens your chat - tap the camera icon there to video call."
              onPress={() => onLaunch('whatsapp', false)} />
          )}
          {!person.platforms.length && !whatsappByNumber && (
            <Text style={[styles.sub, { color: t.muted }]}>No video links saved for {person.name} yet.</Text>
          )}

          {rooms.length > 0 && <Text style={[ui.section, { color: t.muted }]}>Or invite {person.name} to your room</Text>}
          {rooms.map((k) => (
            <Option key={`mine-${k}`} t={t} tone={PLATFORMS[k].tone} dashed title={`Your ${PLATFORMS[k].label} room`}
              how={`Texts ${person.name} your link, then opens your room.${k === 'jitsi' ? ' Nothing to install for them.' : ''}`}
              onPress={() => onLaunch(k, true)} />
          ))}

          {voice.length > 0 && <Text style={[ui.section, { color: t.muted }]}>Voice</Text>}
          {voice.map((v) => <Option key={v.key} t={t} tone={v.tone} title={v.label} how={v.how} onPress={() => onLaunch(v.key, false)} />)}

          {person.phone && askable.length > 0 && <Text style={[ui.section, { color: t.muted }]}>Ask {person.name} for a link</Text>}
          {person.phone && askable.length > 0 && (
            <View style={ui.chips}>
              {askable.map((k) => (
                <Pressable key={k} onPress={() => onAsk(k)}
                  style={[ui.chip, { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.card }]}>
                  <Text style={[ui.chipText, { color: t[PLATFORMS[k].tone] }]}>+ {PLATFORMS[k].label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <AddLink person={person} t={t} onSaved={onLinkSaved} />

          <Text style={[ui.section, { color: t.muted }]}>Your notes</Text>
          <PersonNote person={person} t={t} />

          <Text style={[ui.section, { color: t.muted }]}>Clean up</Text>
          <View style={styles.rowGap}>
            <Pressable onPress={onHide} style={[styles.half, { backgroundColor: t.card, borderWidth: 1, borderColor: t.line }]}>
              <Text style={[styles.sub, { color: t.ink, fontWeight: '600', textAlign: 'center' }]}>Hide from Krypu</Text>
            </Pressable>
            <Pressable onPress={onDelete} style={[styles.half, { backgroundColor: t.card, borderWidth: 1, borderColor: t.clay }]}>
              <Text style={[styles.sub, { color: t.clay, fontWeight: '600', textAlign: 'center' }]}>Delete contact…</Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={[styles.cancelText, { color: t.muted }]}>Close</Text>
          </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Shown when you come back to Krypu after starting a call: did the link work?
function CallCheck({ call, t, onWorked, onFailed }) {
  const { label } = PLATFORMS[call.platform];
  return (
    <View style={[styles.rooms, { backgroundColor: t.card, borderColor: t.clay }]}>
      <Text style={[styles.name, { color: t.ink }]}>
        Did your {label} call with {call.person.name} work?
      </Text>
      <View style={styles.rowGap}>
        <Pressable onPress={onWorked} style={[styles.half, { backgroundColor: t.sageSoft }]}>
          <Text style={[ui.primaryText, { color: t.sage }]}>Yes, it worked</Text>
        </Pressable>
        <Pressable onPress={onFailed} style={[styles.half, { backgroundColor: t.claySoft }]}>
          <Text style={[ui.primaryText, { color: t.clay }]}>Link didn't work</Text>
        </Pressable>
      </View>
    </View>
  );
}

// After a call that worked: "Anything to remember?" - type or use the keyboard's mic to dictate.
function AfterCallNotes({ call, t, onDone, onTasks }) {
  const { settings, update } = useSettings();
  const [note, setNote] = useState(call.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [kept, setKept] = useState('');       // shown when the note had nothing to do, only things to remember
  const recorded = useRef(false);
  const first = call.person.name.split(' ')[0];
  const find = async () => {
    setBusy(true); setError('');
    try {
      const apiKey = settings.aiProvider === 'claude' ? await getAiKey() : null;
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const found = await analyzeNote({ note, personName: call.person.name, ai: { provider: settings.aiProvider, apiKey }, timeZone: zone });
      if (!recorded.current) {                    // the call goes into their history once, even if you tap again
        recorded.current = true;
        update(recordCall({ person: call.person, platform: call.platform, note, found }));
      }
      if (found.tasks.length) onTasks(found.tasks, note);
      else {
        const n = found.follow_ups.length;
        setKept(n ? `Saved. Next time you call ${first}, Krypu will remind you to ask about ${n === 1 ? 'one thing' : `${n} things`}.`
                  : `Saved to ${first}'s call history.`);
      }
    } catch (e) {
      setError(e.message || "Couldn't reach the AI. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  return (
    <View style={[styles.rooms, { backgroundColor: t.card, borderColor: t.sage }]}>
      <Text style={[styles.name, { color: t.ink }]}>Anything to remember from your call with {call.person.name}?</Text>
      <TextInput value={note} onChangeText={setNote} multiline autoFocus
        placeholder="Mom wants help with her printer on Saturday…  (tap the keyboard mic to talk)" placeholderTextColor={t.muted}
        style={[styles.note, { backgroundColor: t.paper, borderColor: t.line, color: t.ink }]} />
      {!!error && <Text style={[styles.sub, { color: t.clay }]}>{error}</Text>}
      {kept ? (
        <>
          <Text style={[styles.sub, { color: t.sage, fontSize: 15 }]}>{kept}</Text>
          <Pressable onPress={onDone} style={[ui.primary, { backgroundColor: t.sage }]}>
            <Text style={[ui.primaryText, { color: t.paper }]}>OK</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.rowGap}>
          <Pressable onPress={onDone} style={[styles.half, { backgroundColor: t.paper, borderWidth: 1, borderColor: t.line }]}>
            <Text style={[ui.primaryText, { color: t.muted }]}>Nothing</Text>
          </Pressable>
          <Pressable onPress={find} disabled={!note.trim() || busy} style={[styles.half, { backgroundColor: note.trim() ? t.sage : t.line }]}>
            {busy ? <ActivityIndicator color={t.paper} /> : <Text style={[ui.primaryText, { color: note.trim() ? t.paper : t.muted }]}>Save note</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Tasks found in the note: untick any you don't want, then save. The last save target becomes the big button.
function TasksPopup({ found, t, onClose }) {
  const { settings, update } = useSettings();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState(() => found?.tasks.map(() => true) ?? []);
  const [saved, setSaved] = useState('');
  if (!found) return null;
  const chosen = found.tasks.filter((_, i) => picked[i]);
  const main = TASK_TARGETS.find((x) => x.key === settings.taskTarget);
  const others = TASK_TARGETS.filter((x) => x !== main);

  // Chosen tasks always go on Krypu's own task list (Tasks screen + the person's sheet), and also to the app you pick.
  const save = async (target) => {
    update((s) => addTasks({ person: found.person, tasks: chosen })(target ? { ...s, taskTarget: target.key } : s));
    if (target) try { await saveTasks(target.key, chosen, { personName: found.person.name, myEmail: settings.myEmail }); } catch {}
    setSaved(target ? target.label : 'Krypu');
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: t.scrim }]} onPress={onClose}>
        <Pressable style={[styles.sheet, styles.sheetBody, { backgroundColor: t.paper, borderColor: t.line, paddingBottom: 32 + insets.bottom }]}>
          <Text style={[styles.sheetTitle, { color: t.ink }]}>{saved ? (saved === 'Krypu' ? 'Kept in Krypu' : `Saved to ${saved}`) : 'Tasks from your call'}</Text>
          {!!saved && <Text style={[styles.sub, { color: t.muted, marginTop: -6 }]}>Also on your Tasks list and on {found.person.name.split(' ')[0]}'s card.</Text>}
          {found.tasks.map((task, i) => (
            <Pressable key={i} onPress={() => setPicked((p) => p.map((v, j) => (j === i ? !v : v)))}
              style={[styles.option, { backgroundColor: t.card, borderColor: picked[i] ? t.sage : t.line }]}>
              <View style={[styles.check, { borderColor: picked[i] ? t.sage : t.line, backgroundColor: picked[i] ? t.sage : 'transparent' }]}>
                {picked[i] && <Text style={[styles.checkMark, { color: t.paper }]}>✓</Text>}
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.name, { color: t.ink, fontSize: 16 }]}>{task.title}</Text>
                {!!(task.due_date || task.due_time) &&
                  <Text style={[styles.sub, { color: t.muted }]}>{[task.due_date, task.due_time].filter(Boolean).join(' · ')}</Text>}
              </View>
            </Pressable>
          ))}
          {saved ? (
            <Pressable onPress={onClose} style={[ui.primary, { backgroundColor: t.sage }]}>
              <Text style={[ui.primaryText, { color: t.paper }]}>Done</Text>
            </Pressable>
          ) : (
            <>
              {main && (
                <Pressable onPress={() => save(main)} disabled={!chosen.length} style={[ui.primary, { backgroundColor: chosen.length ? t.clay : t.line }]}>
                  <Text style={[ui.primaryText, { color: chosen.length ? t.onClay : t.muted }]}>Save to {main.label}</Text>
                </Pressable>
              )}
              <Text style={[ui.section, { color: t.muted }]}>{main ? 'Or save to' : 'Save to'}</Text>
              <View style={styles.rowGap}>
                {others.map((x) => (
                  <Pressable key={x.key} onPress={() => save(x)} disabled={!chosen.length}
                    style={[styles.half, { paddingHorizontal: 4, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }]}>
                    <Text style={[styles.sub, { color: t.ink, fontWeight: '600', textAlign: 'center' }]}>{x.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => save(null)} disabled={!chosen.length} style={styles.cancel}>
                <Text style={[styles.cancelText, { color: chosen.length ? t.sage : t.muted }]}>Keep in Krypu only</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Their link failed: ask them for a new one, or paste one you already have.
function FixTheirLink({ fix, t, onClose, onFixed, onAsk }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    try { await saveLink(fix.person, draft.trim()); setDraft(''); onFixed(); } catch (e) { setError(e.message); }
  };
  const insets = useSafeAreaInsets();
  if (!fix) return null;
  const { label } = PLATFORMS[fix.platform];
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: t.scrim }]} onPress={onClose}>
        <Pressable style={[styles.sheet, styles.sheetBody, { backgroundColor: t.paper, borderColor: t.line, paddingBottom: 32 + insets.bottom }]}>
          <Text style={[styles.sheetTitle, { color: t.ink }]}>Fix {fix.person.name}'s {label} link</Text>
          <Text style={[ui.lede, { color: t.muted }]}>
            Links can stop working if they're deleted or expire. Ask {fix.person.name} for a new one, or paste one you already have.
          </Text>
          <Pressable onPress={onAsk} style={[ui.primary, { backgroundColor: t.clay }]}>
            <Text style={[ui.primaryText, { color: t.onClay }]}>Ask for a new link</Text>
          </Pressable>
          <TextInput value={draft} onChangeText={setDraft} placeholder={`Paste a new ${label} link`} placeholderTextColor={t.muted}
            autoCapitalize="none" style={[styles.search, { backgroundColor: t.card, borderColor: t.line, color: t.ink }]} />
          {!!error && <Text style={[styles.sub, { color: t.clay }]}>{error}</Text>}
          {!!draft.trim() && (
            <Pressable onPress={save} style={[ui.primary, { backgroundColor: t.card, borderWidth: 1, borderColor: t.clay }]}>
              <Text style={[ui.primaryText, { color: t.clay }]}>Save to {fix.person.name}'s contact</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={[styles.cancelText, { color: t.muted }]}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// A video link is on the clipboard (e.g. copied from their reply): save it to the person you asked.
function CopiedLink({ copied, people, t, onDone }) {
  const { settings, update } = useSettings();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const { label } = PLATFORMS[copied.platform];
  // most recent pending ask for this platform is the best guess
  const guessId = Object.entries(settings.asked).filter(([, a]) => a.platform === copied.platform)
    .sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))[0]?.[0];
  const guess = people.find((p) => p.id === guessId);
  const already = people.find((p) => p.links?.[copied.platform] === copied.url);
  if (already) return null;
  const save = async (person) => {
    try {
      await saveLink(person, copied.url);
      update((s) => { const asked = { ...s.asked }; delete asked[person.id]; return { ...s, asked }; });
      onDone();
    } catch (e) { setError(e.message); }
  };
  const waiting = people.filter((p) => settings.asked[p.id]?.platform === copied.platform && p.id !== guess?.id);
  return (
    <View style={[styles.rooms, { backgroundColor: t.card, borderColor: t.sage }]}>
      <Text style={[styles.name, { color: t.ink }]}>You copied a {label} link</Text>
      <Text style={[styles.sub, { color: t.muted }]} numberOfLines={1}>{copied.url}</Text>
      {!!error && <Text style={[styles.sub, { color: t.clay }]}>{error}</Text>}
      {guess && !picking && (
        <Pressable onPress={() => save(guess)} style={[ui.primary, { backgroundColor: t.sage }]}>
          <Text style={[ui.primaryText, { color: t.paper }]}>Save to {guess.name}</Text>
        </Pressable>
      )}
      {picking && waiting.map((p) => (
        <Pressable key={p.id} onPress={() => save(p)} style={[styles.option, { backgroundColor: t.paper, borderColor: t.line }]}>
          <Text style={[styles.name, { color: t.ink, fontSize: 16 }]}>{p.name}</Text>
        </Pressable>
      ))}
      {picking && !waiting.length && (
        <Text style={[styles.sub, { color: t.muted }]}>Open the person and paste it under "Paste a link they sent you".</Text>
      )}
      <View style={styles.rowGap}>
        {!picking && <Pressable onPress={() => setPicking(true)} hitSlop={6}><Text style={{ color: t.sage, fontWeight: '700' }}>Someone else</Text></Pressable>}
        <Pressable onPress={onDone} hitSlop={6}><Text style={{ color: t.muted, fontWeight: '700' }}>  Not now</Text></Pressable>
      </View>
    </View>
  );
}

// Group mode: saved groups ("Family", "Best friends") select their members in one tap; save the current picks as one.
function SavedGroups({ picked, onPick, t }) {
  const { settings, update } = useSettings();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const save = () => {
    const n = name.trim();
    if (!n) return;
    update((s) => ({ ...s, groups: [...s.groups.filter((g) => g.name.toLowerCase() !== n.toLowerCase()),
                                    { id: Math.random().toString(36).slice(2, 10), name: n, memberIds: [...picked] }] }));
    setNaming(false); setName('');
  };
  const remove = (g) => Alert.alert(`Delete "${g.name}"?`, 'The people stay in your contacts.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => update((s) => ({ ...s, groups: s.groups.filter((x) => x.id !== g.id) })) },
  ]);
  return (
    <View style={{ gap: 8 }}>
      {settings.groups.length > 0 && (
        <View style={ui.chips}>
          {settings.groups.map((g) => (
            <Pressable key={g.id} onPress={() => onPick(g.memberIds)} onLongPress={() => remove(g)}
              style={[ui.chip, { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: t.mossSoft }]}>
              <Text style={[ui.chipText, { color: t.moss }]}>{g.name} · {g.memberIds.length}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {picked.size > 0 && (naming ? (
        <View style={styles.rowGap}>
          <TextInput value={name} onChangeText={setName} autoFocus placeholder="Family, Best friends…" placeholderTextColor={t.muted}
            onSubmitEditing={save} style={[styles.search, { flex: 1, backgroundColor: t.card, borderColor: t.line, color: t.ink }]} />
          <Pressable onPress={save} style={[styles.saveBtn, { backgroundColor: t.moss }]}>
            <Text style={[ui.primaryText, { color: t.paper }]}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setNaming(true)} hitSlop={6}>
          <Text style={{ color: t.moss, fontWeight: '700' }}>+ Save these {picked.size} as a group</Text>
        </Pressable>
      ))}
      {settings.groups.length > 0 && <Text style={[styles.sub, { color: t.muted }]}>Tip: press and hold a group to delete it.</Text>}
    </View>
  );
}

export default function Home() {
  const t = useTheme();
  const { settings, update } = useSettings();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(null);
  const [picking, setPicking] = useState(false);
  const [group, setGroup] = useState(new Set());
  const [call, setCall] = useState(null);        // the last call Krypu started: {person, platform, mine, back}
  const [fix, setFix] = useState(null);          // their link that failed, being fixed
  const [broken, setBroken] = useState(new Set()); // "<contactId>:<platform>" links reported as not working
  const [notesFor, setNotesFor] = useState(null);  // call that worked → "anything to remember?"
  const [found, setFound] = useState(null);        // {person, tasks} to show in the tasks popup

  const contacts = useContacts();
  const params = useLocalSearchParams();
  useEffect(() => {
    if (!params.after) return;
    const person = contacts.people.find((p) => p.id === params.after);
    if (!person) return;
    const info = { person, platform: params.platform, mine: false, note: params.note };
    if (params.failed) { setBroken((b) => new Set(b).add(`${person.id}:${params.platform}`)); setFix(info); }
    else setNotesFor(info);
    // clear the one-time params after the navigator has mounted (a cold start straight to Home would crash otherwise)
    setTimeout(() => router.setParams({ after: undefined, note: undefined, failed: undefined, platform: undefined }), 0);
  }, [params.after, contacts.people.length]);
  const [copied, setCopied] = useState(null);      // {url, platform} found on the clipboard, not saved yet
  const seenClip = useRef('');
  const checkClipboard = async () => {
    try {
      if (!(await Clipboard.hasStringAsync())) return;
      const clip = (await Clipboard.getStringAsync()).trim();
      const url = clip.match(/https:\/\/\S+/)?.[0];
      const platform = url && detectPlatform(url);
      if (!platform || url === seenClip.current) return;
      seenClip.current = url;
      setCopied({ url, platform });
    } catch {}
  };
  useEffect(() => { checkClipboard(); }, []);
  const [autoSaved, setAutoSaved] = useState([]); // links saved from your texts since you last looked
  const peopleRef = useRef([]);
  peopleRef.current = contacts.people;
  const collect = async () => {
    if (!peopleRef.current.length) return;
    const { saved } = await collectNewLinks(peopleRef.current).catch(() => ({ saved: [] }));
    if (saved.length) {
      setAutoSaved((a) => [...a, ...saved]);
      update((s) => { const asked = { ...s.asked }; saved.forEach((m) => delete asked[m.person.id]); return { ...s, asked }; });
      contacts.reload?.();
    }
  };
  useEffect(() => { collect(); }, [contacts.people.length]);
  // Steps Krypu runs one at a time, each when you come back to it: e.g. text them → open the call.
  // When the queue is empty and you come back, "did it work?" appears.
  const queue = useRef([]);
  const step = async () => {
    const next = queue.current.shift();
    if (!next) return false;
    try { await next(); } catch (e) { queue.current = []; setCall(null); Alert.alert("Couldn't open that", e.message); }
    return true;
  };
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s !== 'active') return;
      checkClipboard();
      collect();
      if (!(await step())) setCall((c) => c && (c.screen ? null : { ...c, back: true }));
    });
    return () => sub.remove();
  }, []);
  // run a call: steps as above; the web preview can't open apps, so it goes straight to "did it work?"
  const run = (info, steps) => {
    if (Platform.OS === 'web') { setCall({ ...info, back: true }); return; }
    queue.current = steps; setCall({ ...info, back: false }); step();
  };

  // any text Krypu opens for someone is remembered, so a FaceTime nudge right after isn't sent twice
  const texted = (person) => update((s) => ({ ...s, lastText: { ...s.lastText, [person.id]: new Date().toISOString() } }));
  const textedRecently = (person) => Date.now() - Date.parse(settings.lastText?.[person.id] ?? 0) < 10 * 60 * 1000;
  const textTo = (person, body) => { texted(person); return text(person.phone, body); };

  const launch = (platform, mine) => {
    const person = selected; setSelected(null);
    if (platform === 'phone') return run({ person, platform: 'phone', mine: false }, [() => callPhone(person)]);
    if (platform === 'whatsapp-voice') return run({ person, platform: 'whatsapp', mine: false }, [() => openTheirs(person, 'whatsapp')]);
    if (mine) {
      const url = settings.myRooms[platform];
      return run({ person, platform, mine }, [() => textTo(person, inviteText(platform, url)), () => openRoom(url)]);
    }
    // FaceTime links don't ring the iPhone - text them first so they know to let you in (not again if you just did)
    // FaceTime with Chrome available: the in-call screen (notes on top, call docked below) takes over
    const split = platform === 'facetime' && canSplit();
    const open = split ? () => router.push({ pathname: '/call', params: { id: person.id, platform } }) : () => openTheirs(person, platform);
    const steps = platform === 'facetime' && person.phone && !textedRecently(person)
      ? [() => textTo(person, nudgeText('facetime')), open]
      : [open];
    run({ person, platform, mine, screen: split }, steps);
  };
  const markAsked = (person, platform) => update((s) => ({ ...s,
    asked: { ...s.asked, [person.id]: { platform, at: new Date().toISOString() } },
    // asking for a FaceTime link means they have an iPhone
    iphone: platform === 'facetime' ? { ...s.iphone, [person.id]: true } : s.iphone }));
  const ask = (person, platform) => { setSelected(null); markAsked(person, platform); textTo(person, askText(platform)).catch(() => {}); };
  const groupCall = (platform) => {
    const url = settings.myRooms[platform];
    const invited = contacts.people.filter((p) => group.has(p.id) && p.phone);
    const who = { id: 'group', name: invited.map((p) => p.name.split(' ')[0]).join(', ') || 'your group' };
    stopPicking();
    // one text per person (no group thread), then your room
    run({ person: who, platform, mine: true }, [...invited.map((p) => () => textTo(p, inviteText(platform, url))), () => openRoom(url)]);
  };

  const failed = () => {
    const c = call; setCall(null);
    if (c.mine) router.push({ pathname: '/settings', params: { fix: c.platform } });
    else { setBroken((b) => new Set(b).add(`${c.person.id}:${c.platform}`)); setFix(c); }
  };
  const fixed = () => {
    setBroken((b) => { const n = new Set(b); n.delete(`${fix.person.id}:${fix.platform}`); return n; });
    setFix(null);
  };
  const askAgain = () => { markAsked(fix.person, fix.platform); textTo(fix.person, askText(fix.platform)).catch(() => {}); fixed(); };

  const enabled = settings?.enabled ?? {};
  const rooms = HOSTABLE.filter((k) => enabled[k] && settings?.myRooms[k]);
  // only show platforms you've switched on
  const hidden = settings?.hidden ?? {};
  const all = useMemo(() => contacts.people.filter((c) => !hidden[c.id])
    .map((c) => ({ ...c, platforms: c.platforms.filter((p) => enabled[p]) })), [contacts.people, enabled, hidden]);
  const withVideo = all.filter((c) => c.platforms.length > 0).length;
  // nobody has links yet (typical on day one) → show everyone rather than an empty list
  const everyone = showAll || picking || withVideo === 0;
  const people = all.filter((c) => (everyone || c.platforms.length > 0) && c.name.toLowerCase().includes(query.trim().toLowerCase()));

  if (!settings) return null;
  if (!settings.onboarded) return <Redirect href="/welcome" />;

  const toggle = (id) => setGroup((g) => { const n = new Set(g); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const stopPicking = () => { setPicking(false); setGroup(new Set()); };

  const footer = picking && (
    <View style={[styles.bar, { backgroundColor: t.paper, borderColor: t.line }]}>
      <Pressable onPress={stopPicking} style={styles.barCancel}>
        <Text style={[styles.cancelText, { color: t.muted }]}>Cancel</Text>
      </Pressable>
      <View style={styles.barRooms}>
        {group.size === 0 || rooms.length === 0
          ? <View style={[styles.barGo, { backgroundColor: t.line }]}>
              <Text style={[ui.primaryText, { color: t.muted }]}>{rooms.length ? 'Pick people' : 'Set up a room in Settings'}</Text>
            </View>
          : rooms.map((k) => (
              <Pressable key={k} onPress={() => groupCall(k)} style={[styles.barGo, { backgroundColor: t[PLATFORMS[k].tone] }]}>
                <Text style={[ui.primaryText, { color: t.paper }]}>{PLATFORMS[k].label} · {group.size}</Text>
              </Pressable>
            ))}
      </View>
    </View>
  );

  return (
    <Screen footer={footer}>
      <View style={styles.titleRow}>
        <Text style={[ui.title, styles.flex, { color: t.ink }]}>{picking ? 'Who should join?' : 'Who do you want to see?'}</Text>
        {!picking && settings.tasks.length > 0 && (
          <Pressable onPress={() => router.push('/tasks')} hitSlop={10} accessibilityLabel="Tasks"
            style={[styles.gear, styles.tasksBtn, { borderColor: t.line, backgroundColor: t.card }]}>
            <Text numberOfLines={1} style={{ color: t.sage, fontSize: 15, fontWeight: '700' }}>✓ {settings.tasks.filter((x) => !x.done).length}</Text>
          </Pressable>
        )}
        {!picking && (
          <Pressable onPress={() => router.push('/settings')} hitSlop={10} accessibilityLabel="Settings"
            style={[styles.gear, { borderColor: t.line, backgroundColor: t.card }]}>
            <Text style={{ color: t.muted, fontSize: 20 }}>⚙︎</Text>
          </Pressable>
        )}
      </View>
      {!picking && <UpdateBanner />}
      {!picking && autoSaved.length > 0 && (
        <Pressable onPress={() => setAutoSaved([])} style={[styles.rooms, { backgroundColor: t.card, borderColor: t.sage }]}>
          <Text style={[styles.name, { color: t.ink }]}>Saved from your texts</Text>
          {autoSaved.map((m, i) => (
            <Text key={i} style={[styles.sub, { color: t.muted }]}>✓ {m.person.name} · {PLATFORMS[m.platform].label}</Text>
          ))}
          <Text style={{ color: t.sage, fontWeight: '700' }}>OK</Text>
        </Pressable>
      )}
      {!picking && copied && (
        <CopiedLink copied={copied} people={contacts.people} t={t} onDone={() => { setCopied(null); contacts.reload?.(); }} />
      )}
      {!picking && contacts.status === 'ready' && withVideo < 3 && all.length > 0 && (
        <Pressable onPress={() => router.push('/iphones')} style={[styles.rooms, { backgroundColor: t.card, borderColor: t.clay }]}>
          <Text style={[styles.name, { color: t.ink }]}>Get FaceTime links from your iPhone people</Text>
          <Text style={[styles.sub, { color: t.muted }]}>
            Most of your people have no video links yet. Tick who has an iPhone and Krypu texts them how to send you one.
          </Text>
          <Text style={{ color: t.clay, fontWeight: '700' }}>Who has an iPhone? ›</Text>
        </Pressable>
      )}
      {contacts.status === 'ask' && (
        <View style={[styles.rooms, { backgroundColor: t.card, borderColor: t.clay }]}>
          <Text style={[styles.name, { color: t.ink }]}>See your people</Text>
          <Text style={[styles.sub, { color: t.muted }]}>
            Krypu reads your contacts to show who you can call and how, and saves video links onto their contact cards.
            Nothing leaves your phone.
          </Text>
          <Pressable onPress={contacts.ask} style={[ui.primary, { backgroundColor: t.clay }]}>
            <Text style={[ui.primaryText, { color: t.onClay }]}>Allow contacts</Text>
          </Pressable>
        </View>
      )}
      {contacts.status === 'denied' && (
        <View style={[styles.rooms, { backgroundColor: t.card, borderColor: t.clay }]}>
          <Text style={[styles.name, { color: t.ink }]}>Contacts are turned off for Krypu</Text>
          <Text style={[styles.sub, { color: t.muted }]}>Turn on Contacts in Krypu's app settings to see your people.</Text>
          <Pressable onPress={() => Linking.openSettings()} style={[ui.primary, { backgroundColor: t.clay }]}>
            <Text style={[ui.primaryText, { color: t.onClay }]}>Open settings</Text>
          </Pressable>
        </View>
      )}
      {!picking && call?.back && <CallCheck call={call} t={t} onWorked={() => { setNotesFor(call); setCall(null); }} onFailed={failed} />}
      {!picking && notesFor && (
        <AfterCallNotes key={notesFor.person.id} call={notesFor} t={t} onDone={() => setNotesFor(null)}
          onTasks={(tasks) => { setFound({ person: notesFor.person, tasks }); setNotesFor(null); }} />
      )}
      {picking
        ? <>
            <Text style={[ui.lede, { color: t.muted }]}>Pick people or a saved group, then choose which of your rooms to use. Each of them gets the link by text.</Text>
            <SavedGroups picked={group} onPick={(ids) => setGroup(new Set(ids))} t={t} />
          </>
        : <View style={[styles.rooms, { backgroundColor: t.card, borderColor: t.line }]}>
            <Text style={[ui.section, { color: t.muted, marginTop: 0 }]}>Your rooms, ready to send</Text>
            <View style={ui.chips}>
              {HOSTABLE.filter((k) => enabled[k]).map((k) => {
                const { label, tone } = PLATFORMS[k];
                const ready = !!settings.myRooms[k];
                return (
                  <Pressable key={k} onPress={() => router.push('/settings')}
                    style={[ui.chip, ready ? { backgroundColor: t[`${tone}Soft`] } : { borderWidth: 1, borderColor: t.line, borderStyle: 'dashed' }]}>
                    <Text style={[ui.chipText, { color: ready ? t[tone] : t.muted }]}>{ready ? `✓ ${label}` : `+ ${label}`}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => setPicking(true)} style={[styles.groupBtn, { borderColor: t.moss }]}>
              <Text style={[styles.groupText, { color: t.moss }]}>Start a group call</Text>
            </Pressable>
          </View>}
      <TextInput
        value={query} onChangeText={setQuery} placeholder="Search contacts" placeholderTextColor={t.muted}
        style={[styles.search, { backgroundColor: t.card, borderColor: t.line, color: t.ink }]}
      />
      {!picking && (
        <View style={styles.toggleRow}>
          <Text style={[styles.sub, { color: t.muted }]}>Show everyone, including people without video links</Text>
          <Switch value={showAll} onValueChange={setShowAll} trackColor={{ false: t.line, true: t.clay }} />
        </View>
      )}
      {people.map((p) => (
        <Person key={p.id} person={p} t={t} picking={picking} picked={group.has(p.id)}
          broken={broken} iphone={settings.iphone[p.id] ?? (p.iphoneHint || settings.asked[p.id]?.platform === 'facetime')} asked={settings.asked[p.id]?.platform === 'facetime'} note={settings.notes[p.id]} zone={zoneFor(p, settings)} now={now} onPress={() => (picking ? toggle(p.id) : setSelected(p))} />
      ))}
      {people.length === 0 && <Text style={[ui.lede, { color: t.muted }]}>No one matches “{query}”.</Text>}
      <PlatformSheet person={selected} rooms={rooms} t={t} onClose={() => setSelected(null)} onLaunch={launch}
        onAsk={(platform) => ask(selected, platform)}
        onHide={() => { const p = selected; setSelected(null); update((s) => ({ ...s, hidden: { ...s.hidden, [p.id]: p.name } })); }}
        onDelete={() => {
          const p = selected;
          const remove = async () => {
            setSelected(null);
            try { await deleteContact(p); contacts.reload?.(); } catch (e) { Alert.alert("Couldn't delete", e.message); }
          };
          if (settings.skipDeleteConfirm) return remove();
          Alert.alert(`Delete ${p.name}?`, "This action will delete them from your contacts - on this phone and in the Google " +
            "account they sync to (Google keeps deleted contacts in Trash for 30 days). To just tidy Krypu, use Hide instead.", [
            { text: 'Cancel', style: 'cancel' },
            { text: "Delete, and don't ask again", style: 'destructive', onPress: () => { update({ skipDeleteConfirm: true }); remove(); } },
            { text: 'Delete', style: 'destructive', onPress: remove },
          ]);
        }}
        onLinkSaved={(platform, url) => { setSelected((p) => p && { ...p, links: { ...p.links, [platform]: url },
          platforms: p.platforms.includes(platform) ? p.platforms : [...p.platforms, platform] }); contacts.reload?.(); }} />
      <FixTheirLink fix={fix} t={t} onClose={() => setFix(null)} onFixed={() => { fixed(); contacts.reload?.(); }} onAsk={askAgain} />
      <TasksPopup key={found?.person.id} found={found} t={t} onClose={() => setFound(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  gear: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  search: { height: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between', marginBottom: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  picked: { borderWidth: 2 },
  avatar: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700', fontFamily: 'Georgia' },
  cardBody: { flex: 1, gap: 6 },
  name: { fontSize: 18, fontWeight: '600' },
  sub: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
  chev: { fontSize: 28, marginLeft: 4 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 15, fontWeight: '800' },
  rooms: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  groupBtn: { padding: 11, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center' },
  groupText: { fontSize: 15, fontWeight: '600' },
  rowGap: { flexDirection: 'row', gap: 8 },
  memRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tasksBtn: { width: 'auto', minWidth: 42, paddingHorizontal: 10 },
  askedBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 },
  smallCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 2 },
  // local time sits on its own line: beside the name, Android measured it too short and clipped it
  time: { flexShrink: 0 },
  timeLine: { marginTop: -4 },
  warn: { padding: 10, borderRadius: 12 },
  half: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, maxHeight: '88%',
           maxWidth: 560, width: '100%', alignSelf: 'center' },
  sheetBody: { padding: 20, paddingBottom: 32, gap: 10 },
  note: { minHeight: 70, borderWidth: 1, borderRadius: 14, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  saveBtn: { paddingHorizontal: 16, borderRadius: 14, justifyContent: 'center' },
  sheetTitle: { fontSize: 24, fontWeight: '700', fontFamily: 'Georgia', marginBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  mine: { borderStyle: 'dashed', borderWidth: 1.5 },
  cancel: { padding: 12, alignItems: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 28, borderTopWidth: 1 },
  barCancel: { paddingHorizontal: 16, justifyContent: 'center' },
  barRooms: { flex: 1, flexDirection: 'row', gap: 8 },
  barGo: { flex: 1, paddingVertical: 14, paddingHorizontal: 6, borderRadius: 14, alignItems: 'center' },
});
