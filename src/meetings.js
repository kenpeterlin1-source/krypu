// Upcoming meetings from the phone's calendars that have a video link (Zoom, Meet, Teams, FaceTime, Jitsi…), for the
// "Coming up" list on Home. Read-only; nothing leaves the phone. Calendars can be switched off in Settings.
import * as Calendar from 'expo-calendar';
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

export async function calendarList() {
  if (Platform.OS === 'web') return [];
  const { status } = await Calendar.getCalendarPermissionsAsync();
  if (status !== 'granted') return [];
  return (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).map((c) => ({ id: c.id, title: c.title, account: c.source?.name }));
}

// {status: 'web' | 'ask' | 'denied' | 'ready', meetings: [{id, title, start, end, calendar, link: {url, platform}}], ask()}
export function useMeetings(hiddenCalendars = {}, hours = 36) {
  const [state, setState] = useState({ status: Platform.OS === 'web' ? 'web' : 'loading', meetings: [] });
  const load = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const perm = await Calendar.getCalendarPermissionsAsync();
      if (perm.status !== 'granted') { setState({ status: perm.canAskAgain ? 'ask' : 'denied', meetings: [] }); return; }
      const cals = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).filter((c) => !hiddenCalendars[c.id]);
      const now = Date.now();
      const events = cals.length ? await Calendar.getEventsAsync(cals.map((c) => c.id), new Date(now - 60 * 60e3), new Date(now + hours * 3600e3)) : [];
      const meetings = events
        .map((e) => ({ id: String(e.id), title: e.title?.trim() || 'Meeting', start: e.startDate, end: e.endDate,
                       calendar: cals.find((c) => c.id === e.calendarId)?.title, link: meetingLink(e) }))
        .filter((m) => m.link && new Date(m.end).getTime() > now)
        .sort((a, b) => new Date(a.start) - new Date(b.start));
      setState({ status: 'ready', meetings });
    } catch {
      setState({ status: 'ready', meetings: [] });
    }
  }, [JSON.stringify(hiddenCalendars), hours]);
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
