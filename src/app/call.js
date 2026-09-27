// In a FaceTime call, inside Krypu: FaceTime (its web version) runs in the top part of the screen and your notes are
// underneath with the keyboard, so you can type while you talk. Krypu types your name into FaceTime's "who's joining"
// box. End call → back home to the after-call notes (just notes / tasks / schedule the next call).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useContacts } from '../contacts';
import { openTheirs } from '../launch';
import { PLATFORMS } from '../platforms';
import { useSettings } from '../settings';
import { useTheme } from '../theme';
import { guessZone, localTime, useNow, zoneName } from '../timezones';
import { ui } from '../ui';

// FaceTime's web page supports Chrome; present the in-app view as plain Chrome for Android
const CHROME_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

// Fill FaceTime's name box once it appears (React-controlled input: use the native setter, then fire input/change).
const fillName = (name) => `(function () {
  var name = ${JSON.stringify(name)}, tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    var el = document.querySelector('input[type="text"], input:not([type])');
    if (el && !el.value) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, name);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      clearInterval(timer);
    }
    if (tries > 80) clearInterval(timer);
  }, 500);
})(); true;`;

export default function Call() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id, platform = 'facetime', testUrl } = useLocalSearchParams();
  const { settings } = useSettings();
  const contacts = useContacts();
  const now = useNow();
  const person = contacts.people.find((p) => p.id === id);
  const [allowed, setAllowed] = useState(Platform.OS !== 'android');
  const [callNote, setCallNote] = useState('');
  const [error, setError] = useState('');

  // camera + microphone for the call (Android asks once)
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO])
      .then((r) => Object.values(r).every((v) => v === PermissionsAndroid.RESULTS.GRANTED)
        ? setAllowed(true) : setError('Krypu needs the camera and microphone for the call. Allow them in Android settings.'))
      .catch((e) => setError(e.message));
  }, []);

  // dev builds only: ?testUrl= opens any page instead of the call, to test the layout without calling anyone
  const url = (__DEV__ && testUrl) || person?.links?.[platform];
  if (!settings || !person) return <View style={[styles.root, { backgroundColor: t.paper }]} />;
  const zone = settings.tz[person.id] ?? guessZone(person.phone);
  const first = person.name.split(' ')[0];
  const done = (failed) => router.replace({ pathname: '/', params: { after: person.id, platform, note: callNote, failed: failed ? '1' : '' } });

  return (
    <View style={[styles.root, { backgroundColor: t.paper, paddingTop: insets.top + 6, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: t.ink }]} numberOfLines={1}>{PLATFORMS[platform].label} with {person.name}</Text>
          {!!zone && <Text style={[styles.sub, { color: t.muted }]}>{localTime(zone, now).time} in {zoneName(zone)}</Text>}
        </View>
        <Pressable onPress={() => done(false)} style={[styles.end, { backgroundColor: t.clay }]} accessibilityLabel="End call">
          <Text style={[ui.primaryText, { color: t.onClay, fontSize: 15 }]}>End call</Text>
        </Pressable>
      </View>

      <View style={[styles.video, { borderColor: t.line, backgroundColor: '#000' }]}>
        {allowed && url && Platform.OS !== 'web' ? (
          <WebView source={{ uri: url }} userAgent={CHROME_UA}
            javaScriptEnabled domStorageEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant" injectedJavaScript={settings.myName ? fillName(settings.myName.trim()) : 'true;'}
            onError={(e) => setError(e.nativeEvent.description || "The call page didn't load.")} style={styles.flex} />
        ) : (
          <Text style={[styles.sub, { color: '#bbb', padding: 16 }]}>{error || (url ? 'Starting the call…' : `No ${PLATFORMS[platform].label} link saved for ${first}.`)}</Text>
        )}
      </View>

      <View style={styles.notes}>
        {!settings.myName && (
          <Pressable onPress={() => router.push('/settings')}>
            <Text style={[styles.sub, { color: t.clay }]}>Tip: add your name in Settings and Krypu will fill it in on FaceTime.</Text>
          </Pressable>
        )}
        <TextInput value={callNote} onChangeText={setCallNote} multiline placeholder={`Notes from this call with ${first}…`}
          placeholderTextColor={t.muted} style={[styles.note, { backgroundColor: t.card, borderColor: t.line, color: t.ink }]} />
        {!!settings.notes[person.id] && (
          <Text style={[styles.sub, { color: t.muted }]} numberOfLines={2}>Your notes: {settings.notes[person.id]}</Text>
        )}
        <View style={styles.row}>
          <Pressable onPress={() => openTheirs(person, platform)} style={styles.link}>
            <Text style={[styles.sub, { color: t.muted }]}>Open in Chrome instead</Text>
          </Pressable>
          <Pressable onPress={() => done(true)} style={styles.link}>
            <Text style={[styles.sub, { color: t.clay, fontWeight: '600' }]}>Link didn't work</Text>
          </Pressable>
        </View>
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
