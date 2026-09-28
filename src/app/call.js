// A call inside Krypu (FaceTime, Jitsi, Zoom - their web versions): the call runs in the top part of the screen and your
// notes are underneath with the keyboard, one line each (follow up / schedule / note). Krypu types your display name
// into the join page. End call (or hanging up in the call itself) → back home to the after-call notes.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useContacts } from '../contacts';
import { openRoom, openTheirs } from '../launch';
import { NoteLines } from '../noteLines';
import { inAppUrl, PLATFORMS } from '../platforms';
import { useSettings } from '../settings';
import { useTheme } from '../theme';
import { guessZone, localTime, useNow, zoneName } from '../timezones';
import { ui } from '../ui';

// FaceTime's web page supports Chrome; present the in-app view as plain Chrome for Android
const CHROME_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

// Runs inside FaceTime's page for the whole call:
//  - fills the "Enter your name" box whenever it's empty (first join, and again if the page comes back after a call);
//  - tells Krypu when the call ends from FaceTime's own hang-up button (video was showing, then gone for ~3 s).
const pageScript = (name) => `(function () {
  if (window.__krypu) return true; window.__krypu = true;
  var name = ${JSON.stringify(name)}, inCall = false, gone = 0, told = false;
  setInterval(function () {
    // only a box that asks for a name (never a passcode or meeting ID)
    var el = Array.prototype.find.call(document.querySelectorAll('input[type="text"], input:not([type])'), function (i) {
      return /name/i.test([i.placeholder, i.getAttribute('aria-label'), i.name, i.id, i.autocomplete].join(' '));
    });
    if (name && el && !el.value && !el.dataset.krypu) {
      el.dataset.krypu = '1';                 // once per box: if you clear it, it stays cleared
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, name);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var video = document.querySelector('video');
    if (video) { inCall = true; gone = 0; }
    else if (inCall && !told && ++gone >= 3) { told = true; window.ReactNativeWebView.postMessage('ended'); }
  }, 1000);
})(); true;`;

export default function Call() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id, platform = 'facetime', testUrl, url: roomUrl, title } = useLocalSearchParams();
  const { settings } = useSettings();
  const contacts = useContacts();
  const now = useNow();
  // a contact, or a calendar meeting (no contact): shown by its title
  const person = contacts.people.find((p) => p.id === id) ?? (title ? { id, name: title, phone: null, links: {} } : undefined);
  const [allowed, setAllowed] = useState(Platform.OS !== 'android');
  const [items, setItems] = useState([]);     // your notes, one line each, with follow up / schedule / note
  const [error, setError] = useState('');
  const [kb, setKb] = useState(0);            // keyboard height: the video shrinks so your notes stay above it

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // camera + microphone for the call (Android asks once)
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO])
      .then((r) => Object.values(r).every((v) => v === PermissionsAndroid.RESULTS.GRANTED)
        ? setAllowed(true) : setError('Krypu needs the camera and microphone for the call. Allow them in Android settings.'))
      .catch((e) => setError(e.message));
  }, []);

  // dev builds only: ?testUrl= opens any page instead of the call, to test the layout without calling anyone
  // your own room (url param) or their saved link, turned into the platform's web version
  const link = roomUrl || person?.links?.[platform];
  const url = (__DEV__ && testUrl) || inAppUrl(platform, link, (settings?.myName ?? '').trim());
  if (!settings || !person) return <View style={[styles.root, { backgroundColor: t.paper }]} />;
  const zone = settings.tz[person.id] ?? guessZone(person.phone);
  const first = person.name.split(' ')[0];
  const done = (failed) => {
    Keyboard.dismiss();
    router.replace({ pathname: '/', params: { after: person.id, platform, note: items.map((x) => x.text).join('\n'),
                                              items: JSON.stringify(items), title: title ?? '', failed: failed ? '1' : '' } });
  };

  return (
    <View style={[styles.root, { backgroundColor: t.paper, paddingTop: insets.top + 6, paddingBottom: kb ? kb + 8 : insets.bottom + 8 }]}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: t.ink }]} numberOfLines={1}>{PLATFORMS[platform].label} with {person.name}</Text>
          {!!zone && <Text style={[styles.sub, { color: t.muted }]}>{localTime(zone, now).time} in {zoneName(zone)}</Text>}
        </View>
        <Pressable onPress={() => done(false)} style={[styles.end, { backgroundColor: t.clay }]} accessibilityLabel="End call">
          <Text style={[ui.primaryText, { color: t.onClay, fontSize: 15 }]}>End call</Text>
        </Pressable>
      </View>

      <View style={[styles.video, kb ? { flex: 1 } : null, { borderColor: t.line, backgroundColor: '#000' }]}>
        {allowed && url && Platform.OS !== 'web' ? (
          <WebView source={{ uri: url }} userAgent={CHROME_UA}
            javaScriptEnabled domStorageEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant" injectedJavaScript={pageScript((settings.myName ?? '').trim())}
            onMessage={(e) => { if (e.nativeEvent.data === 'ended') done(false); }}
            onError={(e) => setError(e.nativeEvent.description || "The call page didn't load.")} style={styles.flex} />
        ) : (
          <Text style={[styles.sub, { color: '#bbb', padding: 16 }]}>{error || (url ? 'Starting the call…' : `No ${PLATFORMS[platform].label} link saved for ${first}.`)}</Text>
        )}
      </View>

      <View style={styles.notes}>
        {!settings.myName && !kb && (
          <Pressable onPress={() => router.push('/settings')}>
            <Text style={[styles.sub, { color: t.clay }]}>Tip: add your name in Settings and Krypu will fill it in on FaceTime.</Text>
          </Pressable>
        )}
        <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 4 }} keyboardShouldPersistTaps="handled"
          ref={(r) => { if (r) setTimeout(() => r.scrollToEnd({ animated: true }), 50); }}>
          <NoteLines items={items} onChange={setItems} t={t} compact placeholder={`Note from this call with ${first} - Enter adds it`} />
        </ScrollView>
        {!!settings.notes[person.id] && !kb && (
          <Text style={[styles.sub, { color: t.muted }]} numberOfLines={2}>Your notes: {settings.notes[person.id]}</Text>
        )}
        {!kb && <View style={styles.row}>
          <Pressable onPress={() => (roomUrl ? openRoom(roomUrl) : openTheirs(person, platform))} style={styles.link}>
            <Text style={[styles.sub, { color: t.muted }]}>{platform === 'facetime' ? 'Open in Chrome instead' : `Open in ${PLATFORMS[platform].label} app`}</Text>
          </Pressable>
          <Pressable onPress={() => done(true)} style={styles.link}>
            <Text style={[styles.sub, { color: t.clay, fontWeight: '600' }]}>Link didn't work</Text>
          </Pressable>
        </View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 12, gap: 8 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  title: { fontSize: 19, fontWeight: '700', fontFamily: 'Georgia' },
  sub: { fontSize: 13, lineHeight: 18 },
  end: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  video: { flex: 1.6, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  notes: { flex: 1, gap: 6 },
  note: { flex: 1, minHeight: 70, borderWidth: 1, borderRadius: 14, padding: 12, fontSize: 16, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { paddingVertical: 4 },
});
