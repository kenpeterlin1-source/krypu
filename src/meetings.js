// Upcoming events from the phone's calendars for the "Coming up" list on Home. Events with a video link (Zoom, Meet, Teams,
// FaceTime, Jitsi…) get a Join button; the rest open in the calendar app. Read-only; nothing leaves the phone.
// Each calendar account is Personal, Business or Off (Settings); single calendars can also be switched off.
import * as Calendar from 'expo-calendar/legacy';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { detectPlatform } from './platforms';

const URL_RE = /https?:\/\/[^\s<>"'()\]]+/gi;

// First video link in an event's URL, location or description.
export function meetingLink(ev) {
  const text = [ev.url, ev.location, ev.notes].filter(Boolean).join(' ');
  for (const raw of text.match(URL_RE) ?? []) {
    const url = raw.replace(/[.,;>]+$/, '');
    const platform = detectPlatform(url);
    if (platform) return { url, platform };
  }
  return null;
}

const PERSONAL_DOMAINS = /@(gmail|googlemail|icloud|me|mac|outlook|hotmail|live|msn|yahoo|aol|proton|protonmail)\./i;

// 'personal' | 'business' | 'off' for a calendar account: your choice in Settings, else a guess from the address
// (gmail.com, icloud.com… and phone-only calendars are personal; any other domain is business).
export function accountKind(account, choices = {}) {
  if (choices[account]) return choices[account];
  if (!account || !account.includes('@')) return 'personal';
  return PERSONAL_DOMAINS.test(account) ? 'personal' : 'business';
}

export async function calendarList() {
  if (Platform.OS === 'web') return [];
  const { status } = await Calendar.getCalendarPermissionsAsync();
  if (status !== 'granted') return [];
  return (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT))
    .filter((c) => c.isVisible !== false)
    .map((c) => ({ id: c.id, title: c.title, account: c.source?.name ?? c.ownerAccount ?? 'This phone' }));
}

export function openEvent(m) {
  Calendar.openEventInCalendarAsync({ id: m.eventId, instanceStartDate: m.start }).catch(() => {});
}

// {status: 'web' | 'ask' | 'denied' | 'ready', meetings: [{id, eventId, title, start, end, calendar, kind, link|null}], ask()}
// All-day events (holidays, birthdays) are left out.
export function useMeetings(hiddenCalendars = {}, accountChoices = {}, hours = 7 * 24) {
  const [state, setState] = useState({ status: Platform.OS === 'web' ? 'web' : 'loading', meetings: [] });
  const choicesKey = JSON.stringify([hiddenCalendars, accountChoices]);
  const load = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const perm = await Calendar.getCalendarPermissionsAsync();
      if (perm.status !== 'granted') { setState({ status: perm.canAskAgain ? 'ask' : 'denied', meetings: [] }); return; }
      const cals = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT))
        .filter((c) => c.isVisible !== false && !hiddenCalendars[c.id])
        .map((c) => ({ ...c, kind: accountKind(c.source?.name ?? c.ownerAccount, accountChoices) }))
        .filter((c) => c.kind !== 'off');
      const now = Date.now();
      const events = cals.length ? await Calendar.getEventsAsync(cals.map((c) => c.id), new Date(now - 60 * 60e3), new Date(now + hours * 3600e3)) : [];
      const meetings = events
        .filter((e) => !e.allDay && e.status !== 'canceled' && e.status !== 'CANCELED')
        .map((e) => {
          const c = cals.find((x) => x.id === e.calendarId);
          return { id: `${e.id}-${e.startDate}`, eventId: String(e.id), title: e.title?.trim() || 'Event', start: e.startDate,
                   end: e.endDate, calendar: c?.title, kind: c?.kind ?? 'personal', location: e.location?.trim() || '',
                   link: meetingLink(e) };
        })
        .filter((m) => new Date(m.end).getTime() > now)
        .sort((a, b) => new Date(a.start) - new Date(b.start));
      setState({ status: 'ready', meetings });
    } catch (e) {
      console.warn('[meetings] load failed', e?.message ?? e);
      setState({ status: 'ready', meetings: [] });
    }
  }, [choicesKey, hours]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    const timer = setInterval(load, 5 * 60e3);
    return () => { sub.remove(); clearInterval(timer); };
  }, [load]);
  const ask = async () => { await Calendar.requestCalendarPermissionsAsync(); load(); };
  return { ...state, ask, reload: load };
}

// "Now", "2:00 pm", "Tomorrow 9:30 am", "Mon 10:00 am"
export function meetingTime(m, now = new Date()) {
  const s = new Date(m.start);
  if (s <= now) return 'Now';
  const time = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(s) - day(now)) / 86400e3);
  if (diff === 0) return time;
  if (diff === 1) return `Tomorrow ${time}`;
  return `${s.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}
