// App settings, saved on the phone (AsyncStorage): which video apps you use and your own room links.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { newJitsiRoom, PLATFORM_ORDER } from './platforms';

const KEY = 'krypu.settings.v1';

export const DEFAULTS = {
  onboarded: false,
  // which platforms show up in Krypu at all (chosen on first run, changeable in Settings)
  enabled: Object.fromEntries(PLATFORM_ORDER.map((k) => [k, ['facetime', 'whatsapp', 'jitsi'].includes(k)])),
  // your own permanent rooms, used to invite people (null = not set up)
  myRooms: { zoom: null, meet: null, teams: null, jitsi: null },
  // your private notes per person, keyed by contact id (kept in Krypu, not written to the contact)
  notes: {},
  // time-zone overrides per contact id, when the guess from the phone number is wrong
  tz: {},
  // AI used to turn after-call notes into tasks ('claude' | 'none'); the key itself is in secure storage (secret.js)
  aiProvider: 'none',
  // where tasks were saved last time - becomes the default button ('google' | 'calendar' | 'email' | 'text')
  taskTarget: null,
  myEmail: '',
  // your private link from peterlin.com/home (the Siri button) - for saving tasks to Peterlin home
  homeUrl: '',
  // display name the other person sees on a web call (FaceTime, Jitsi, Zoom) - Krypu types it into the join page.
  // Blank on a new install; the call screen asks for it, and it's editable in Settings.
  myName: '',
  // everything Krypu remembers about calls, kept on the phone:
  //   tasks: [{id, personId, personName, title, due_date, due_time, done, createdAt}]
  //   calls: {personId: [{id, at, platform, note, followUps: [{text, done}], facts: [..]}]}  (newest first)
  tasks: [],
  calls: {},
  // a phone call Krypu started and hasn't taken notes for yet: {person: {id, name, phone}, at} - kept on the phone so
  // the notes still come up if Android closes Krypu during a long call
  pendingCall: null,
  // saved groups for group calls: [{id, name, memberIds}]
  groups: [],
  // people you've marked as iPhone users: {contactId: true}
  iphone: {},
  // link requests you've sent and not received yet: {contactId: {platform, at}} - used to match a copied link
  asked: {},
  // people hidden from Krypu (still in your phone's contacts): {contactId: name}
  hidden: {},
  // calendars left out of "Coming up" (e.g. a work calendar): {calendarId: true}
  hiddenCalendars: {},
  // each calendar account (usually an email address) as 'personal' | 'business' | 'off'; unset = guessed (meetings.js)
  calendarAccounts: {},
  // which meetings "Coming up" shows: 'all' | 'personal' | 'business'
  meetingView: 'all',
  // true once you chose "Delete, and don't ask again"
  skipDeleteConfirm: false,
  // when Krypu last opened a text to each person: {contactId: ISO time} - skips a repeat nudge right after
  lastText: {},
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null); // null while loading

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const saved = raw ? JSON.parse(raw) : {};
        setSettings({ ...DEFAULTS, ...saved, enabled: { ...DEFAULTS.enabled, ...saved.enabled },
                      myRooms: { ...DEFAULTS.myRooms, ...saved.myRooms }, notes: { ...saved.notes }, tz: { ...saved.tz },
                      tasks: saved.tasks ?? [], calls: { ...saved.calls }, groups: saved.groups ?? [],
                      myName: saved.myName ?? DEFAULTS.myName,
                      iphone: { ...saved.iphone }, hiddenCalendars: { ...saved.hiddenCalendars }, calendarAccounts: { ...saved.calendarAccounts }, asked: { ...saved.asked }, hidden: { ...saved.hidden }, lastText: { ...saved.lastText } });
      })
      .catch(() => setSettings(DEFAULTS));
  }, []);

  const update = useCallback((change) => {
    setSettings((prev) => {
      const next = typeof change === 'function' ? change(prev) : { ...prev, ...change };
      // your Jitsi room is created the first time Jitsi is switched on, then kept
      if (next.enabled.jitsi && !next.myRooms.jitsi) next.myRooms = { ...next.myRooms, jitsi: newJitsiRoom() };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
