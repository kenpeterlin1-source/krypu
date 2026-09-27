# Krypu

A contacts-first video-call launcher for Android: FaceTime links, WhatsApp, Zoom, Meet, Teams, Slack and Jitsi,
one tap per person. Started as "FaceTime for Android" (design below). Named 2026-09-24 - a made-up word, a nod to
cryptids (Scott Sigler's *Nocturnal*) and "KePu".

## Original design: FaceTime for Android

Let the two Android phones in the house join FaceTime calls with the three Apple phones, in one tap,
without anyone re-sharing a link every time.

**Status: designed, not started.** Opened 2026-09-23. No deadline. Personal.

## The actual use case
Five phones in the household: **3 Apple, 2 Android**. The Apple phones can FaceTime each other natively.
The Android phones currently can't join without someone generating and sending a fresh link each time.

## Why this works (and where the ceiling is)

Apple publishes **no FaceTime SDK or API** for Android, and there is no way to sign in to an Apple account
from Android. The one supported route is **FaceTime links** (iOS 15+ / macOS Monterey+): an Apple device
creates a link, and it opens at `facetime.apple.com` over WebRTC in a browser.

The thing that makes this project worth building: **FaceTime links are persistent and reusable.** A link
created in the FaceTime app stays valid until its creator deletes it, and can be named. So each of the three
Apple phones creates **one permanent named link** — "Ken", "Mom", "Kitchen" — shares it with the Android
phones **once**, and the Android app saves all three forever. After that, joining is one tap with no new
link, no message, no setup.

What it still cannot do:
- **Android cannot start a call.** Only Apple devices create links or initiate.
- **No ringing and no push on Android.** There is no background presence to hook into, so an incoming
  FaceTime cannot alert an Android phone. This is the real friction and the design has to work around it
  (see "The no-ringing problem" below).
- **The host must admit the joiner** from their Apple device each time. If nobody on the Apple side is in
  the call, the Android user just sits in the lobby.
- Apple's web client officially supports **Chrome and Edge** on Android and it user-agent sniffs. A plain
  `WebView` will likely be refused or break on camera/mic permissions — use **Chrome Custom Tabs**.

## The no-ringing problem (the part worth designing well)
Because Android can't be rung, a saved link alone only solves half the problem: the Android user can join
instantly, but has no way to know a call is happening, and no way to summon anyone.

**Decided (Ken, 2026-09-23): the nudge is a text message.** Each saved person has one button that
(a) opens the FaceTime link in a Custom Tab and (b) fires an SMS intent to that person's number with a
pre-written "join me on FaceTime" message carrying the link. That turns "join a call someone else started"
into something close to "call them", which is what the household actually wants.
So each saved entry stores: **name + FaceTime link (with fragment) + phone number + message template.**

## Critical implementation detail
A FaceTime link looks like:

    https://facetime.apple.com/join#v=1&p=<...>&k=<...>

The joining secret lives in the **URL fragment**, after the `#`. It is never sent to Apple's server — it is
handled client-side. So the app must **store and pass the complete URL including everything after the `#`**.
Any code path that normalises, rebuilds, or logs a link by its path alone will silently break joining.
Treat saved links as secrets: anyone holding one can join.

## What the app does
1. Intent filter on `https://facetime.apple.com/join*` so a link shared into the house opens in the app.
2. On first receipt of a link: offer to **save it with a name and a phone number** ("Mom").
3. Main screen: a short list of saved people, each a big one-tap **Join** button.
4. Join = warm up a Chrome Custom Tab, ensure camera/mic permission, open the full link with fragment intact.
5. Per-person **"Text to join"** — SMS intent with the link (see above). Core, not optional.
6. Optional: home-screen widget or quick-settings tile for the most-used link.

No accounts, no backend. ~~Links live in local storage~~ → superseded 2026-09-24: links live on the contact card (see Update below).

## To verify before building
- Do FaceTime links really persist indefinitely, or do they rotate? (Design depends on this.)
- Does a Custom Tab carry camera/mic permission cleanly, or does Chrome re-prompt every join?
- Will Chrome claim `facetime.apple.com` via Digital Asset Links and win the intent filter?
- Does the fragment survive the Android intent → Custom Tab handoff intact?

## Update 2026-09-24: ask for links, and keep them in Contacts (Ken's decisions)

### 1. "Ask for their link" - getting the link in the first place
Today someone has to know to make a link and send it. The app does the asking:
- **Ask for link** → pick a contact → choose their mobile number → opens an SMS with a pre-written message:
  > Hi! So I can FaceTime you from my Android phone, could you send me a FaceTime link? On your iPhone:
  > open **FaceTime** → **Create Link** → **Add Name** (e.g. "Ken for Mom") → **Messages** → send it to me.
  > It's a one-time thing - I'll save it and use it every time. Thanks!
- The app remembers **who it asked and when** ("pending"), so when a link arrives it can suggest that person.
- Message text is editable per send; the default lives in settings.

### 2. Links live in Android Contacts (the contact is the source of truth)
Each FaceTime link is written to that person's **contact card** as a **website/URL entry labelled "FaceTime"**
(`ContactsContract.CommonDataKinds.Website`, via `expo-contacts` `urlAddresses`).
- **The app's main list = every contact that has a `facetime.apple.com/join` URL.** No separate app database.
- The **phone number for "Text to join"** comes from the same contact - nothing entered twice.
- Survives an app reinstall or a new phone (if contacts sync to the Google account), and the link is also
  reachable from the normal Contacts app: tapping it opens Chrome → FaceTime.
- Store the **full URL including the `#` fragment**, and check it on read-back (see "Critical implementation detail").
- Trade-off, accepted: the link then sits in the Google account's contacts. Anyone who can see those contacts
  could join that person's FaceTime link (the host still has to admit them).
- Permissions: `READ_CONTACTS` + `WRITE_CONTACTS`.

### 3. Getting a link from Messages into the app (Android 12+ reality)
We can't verify `facetime.apple.com` as an App Link (Apple owns it), so on Android 12+ **tapping a FaceTime link
opens Chrome, not the app**, unless the user turns on "Open supported links" for the app by hand. So support all three:
1. **Share sheet** (most reliable): long-press the link in Messages → Share → *FaceTime Links* (`ACTION_SEND` text/plain).
2. **Clipboard check** on opening the app: "Found a FaceTime link - save it to Mom?" (pre-selects the pending contact).
3. **Paste** field on the Add screen.
The app also offers a one-time "Open supported links" setup screen for people who want tap-to-open.

### Revised main flows
- **Join** (per contact): open the link in a Chrome Custom Tab.
- **Text to join** (per contact): SMS to the contact's mobile with the link.
- **Ask for link**: SMS request (above) → pending → save to contact when it arrives.
- **Fix a link**: if a link stops working, "Ask again" re-sends the request and replaces the URL on the contact.

## Update 2026-09-24 (later): contacts-first, multi-platform (Ken's direction)

The app becomes a **universal "how do I video-call this person" launcher**, built contacts-first. FaceTime is v1;
the design is general from day one.

### Main screen = your phone contacts, filtered to people you can video-call
The app reads the phone's contacts and, for each person, detects every video platform it knows about:

| Platform | How it's detected on the contact | What "call" does |
|---|---|---|
| **FaceTime** | URL entry `facetime.apple.com/join#…` (label "FaceTime") - saved by this app | SMS/WhatsApp nudge + open link in a Chrome Custom Tab |
| **WhatsApp** | WhatsApp's own data rows on the contact (raw contact account `com.whatsapp`, mimetype `vnd.android.cursor.item/vnd.com.whatsapp.video.call`) | **Starts a WhatsApp video call directly** (ACTION_VIEW on that data row - same as the Contacts app) |
| **Zoom** | URL entry `zoom.us/j/…` (or a regional `*.zoom.us`) | Open link → Zoom app |
| **Google Meet** | URL entry `meet.google.com/xxx-xxxx-xxx`; later also Meet's own data rows | Open link → Meet app |
| **Teams** | URL entry `teams.live.com/meet/…` (personal) or `teams.microsoft.com/l/meetup-join/…` / `/l/call/…` (work) | Open link → Teams app |
| **Slack** | URL entry: a huddle link (`app.slack.com/huddle/…`) copied from a DM or channel | Open link → Slack app (both people must be in that workspace) |
| **Jitsi** | URL entry `meet.jit.si/<room>` | Open link → browser or Jitsi app. Also **"Start a Jitsi room"** for *anyone*: the app makes a hard-to-guess room (`meet.jit.si/summit-xxxxxxxxxxxx`), texts them the link, and joins. Guests need no account or app. Note: public meet.jit.si asks the **first person in the room (the host) to sign in** (Google/GitHub/etc.) to start it; guests don't. Self-hosting Jitsi would remove that, not needed for v1 |
| later | Signal, Telegram, Viber (data rows); Messenger, WeChat, LINE, **Snapchat, Instagram** (open their chat/profile only - none let another app start a video call) | |

### Group calls (Jitsi)
**Group call with Jitsi** → pick any number of contacts (including people with no saved links) → **Start room with N
people**: one fresh room link, sent to each person individually over their nudge channel (SMS or WhatsApp - separate
messages, not a group thread), then the app opens the room. Jitsi is the only platform where Krypu can *create* the
call, so it is the group option; FaceTime/Zoom/Meet group calls stay in those apps.

- List shows each person with **platform chips** (FaceTime · WhatsApp · Zoom · Meet); people with none are hidden
  behind a "Show everyone" toggle, where each has **Ask for a link**.
- Search box at the top; favourites/recents pinned first.
- Tap a person → **sheet listing their platforms** → pick one → that platform's workflow runs.
- Per person, remember the **last platform used** and show it first.

### Implementation notes
- `expo-contacts` covers names, phones, URL entries (read + write). It does **not** expose other apps' data rows,
  so WhatsApp/Meet detection and the direct WhatsApp video call need a **small local Expo module (Kotlin)** that
  queries `ContactsContract.Data` by mimetype and fires `ACTION_VIEW` on the data URI. Built in v1.1, not v1.
- Nudge channel per person: SMS or WhatsApp message (`https://wa.me/<number>?text=…`); default SMS for US numbers,
  WhatsApp for international numbers.
- Name: **Krypu** (decided 2026-09-24; replaces the placeholder "FaceTime Links").

### Phasing
- **v1:** contacts-first list + FaceTime end to end (ask, save to contact, join, nudge). Other chips shown only if
  detection is cheap (URL-based Zoom/Meet/Teams/Slack come almost free).
- **v1.1:** native module → WhatsApp detection + direct video call; WhatsApp nudge.
- **v1.2:** Meet data rows, Signal/Telegram, recents/favourites.

### Your rooms (host instead of ask) - 2026-09-24
Set up **your own permanent room once** per platform; Krypu then **sends your link** to whoever you call and opens the room.
The reverse of "ask for their link", and it works for people who have never saved anything.
- **Zoom:** your Personal Meeting Room link (never changes). **Meet:** one "meeting for later" link. **Teams:** one meeting
  link. **Jitsi:** Krypu creates a private room once and keeps it. **FaceTime: not possible** (Android can't create links).
- Setup: paste each link once (help text per platform, same steps as peterlin.com/krypu); Jitsi is automatic.
- Stored in app storage on the phone only.
- Person sheet: their platforms first, then **"Or invite <name> to your room"** (each ready room).
- **Group calls** use any of your ready rooms (Zoom, Meet, Teams or Jitsi), not just Jitsi: pick people → tap the room.
- Auto-creating Zoom/Meet/Teams rooms via their APIs would need sign-in (OAuth) - not planned; pasting once is enough.

### First run, Settings, updates - 2026-09-24
- **Welcome screen (first run):** "Which video apps do you use?" - a toggle per platform (default on: FaceTime, WhatsApp,
  Jitsi). Krypu only shows platforms you turned on. Later: pre-tick apps that are actually installed (Android
  `<queries>` + PackageManager for us.zoom.videomeetings, com.google.android.apps.tachyon, com.microsoft.teams,
  com.Slack, org.jitsi.meet, com.whatsapp).
- **Settings (⚙︎ on home):** the same toggles; "Your rooms" (paste Zoom/Meet/Teams links, checked against the platform;
  Jitsi room auto-created when Jitsi is on); About → version + **Check for updates**.
- **Update check** (`src/update.js`, same approach as DropFile): on launch, reads
  `github.com/kenpeterlin1-source/krypu/releases/latest/download/latest.json`; if its versionCode is newer than the
  installed one (app.json `android.versionCode`), shows "Update available" → opens the APK so Android installs it over
  the old one. Goes live once the repo is renamed to `krypu` and the first release is published.
- Settings are stored with AsyncStorage (key `krypu.settings.v1`).
- Screens use **Expo Router** (`src/app/`: `_layout.js`, `index.js`, `welcome.js`, `settings.js`).

### When a link stops working - 2026-09-24 (Ken)
Android can't tell whether a Zoom/Meet/FaceTime call actually connected, so when you **come back to Krypu** after it
launched a call (AppState → active), the home screen asks **"Did your <app> call with <name> work?"**
- **Yes** → nothing. **Link didn't work** →
  - **your own room:** opens Settings with that room highlighted ("This link didn't work last time. Paste a new one");
    for Jitsi, "Make a new Jitsi room".
  - **their link:** the chip turns **⚠** and a sheet offers **Ask for a new link** (same SMS/WhatsApp request as
    first time) or **Paste a new link** (saved over the old one on their contact).
- Later: count failures per link and suggest "Ask again" automatically after two.

### Voice calls and notes - 2026-09-24 (Ken)
Krypu becomes the one place to reach someone ("contact hub"), not only video.
- Person sheet sections: **Video** (their platforms) · **Or invite to your room** · **Voice** · **Your notes**.
- **Voice:** *Phone call* → `tel:` / ACTION_DIAL (opens the dialer with the number; no permission needed). One-tap
  direct dialing would need CALL_PHONE - not worth it. *WhatsApp voice call* for WhatsApp contacts (native module, v1.1).
  Krypu does **not** replace the Phone app: incoming calls and call history stay in the dialer (default-dialer role and
  call-log access are restricted on Android).
- **Notes:** private per-person notes, saved as you type in Krypu's own storage (`settings.notes[contactId]`), shown as
  a one-line preview on the person's card. Not written to the Google contact (no sync) unless we add an explicit
  "Copy to contact" later.
- **Time zones (built 2026-09-24):** `src/timezones.js` guesses each person's zone from their number (country code;
  North American area codes, e.g. 303/720 → Denver). Their local time shows on the card ("☾ 1:02 AM in Rome" in clay
  when it's 10 pm-7 am there); the sheet warns "It's late for Giulia. Maybe send a message first, or call tomorrow."
  Wrong guess → **Change** picks another zone (saved in `settings.tz`). Unknown numbers show no time.

### After-call notes → tasks - 2026-09-24 (Ken)
Android can't record other apps' calls (and many states/countries need everyone's consent), so Krypu asks right after.
- "Did it work?" → **Yes** → **"Anything to remember from your call with <name>?"** - type, or use the keyboard's mic
  to dictate. **Find tasks** → popup with each task (tick/untick) → save.
- **Save to:** Google Tasks (Android share sheet → Tasks), Calendar (Google Calendar event link per task), Email
  (`mailto:` to your address from Settings), Text (`sms:`). **The last one used becomes the big default button**
  (`settings.taskTarget`, also settable in Settings). Saved tasks are also appended to that person's notes.
- **AI:** setup and Settings ask **"Which AI do you use?"** - Claude (works now; API key stored in the phone's secure
  storage via expo-secure-store), ChatGPT / Gemini (listed as "later", not wired up), or No AI (on-phone fallback that
  picks "can you… / remember to…" sentences). Claude call: `src/ai.js`, `claude-opus-5`, effort low, structured output
  (zod schema: title, due_date, due_time, details), server-side refusal fallback `fallbacks: "default"`; relative days
  resolved against today's date and the phone's time zone.
- Not verified on a device yet: Google Tasks via share sheet, sms:/mailto: behaviour, calendar links opening the app.

### NEXT: Krypu remembers people between calls - 2026-09-24 (Ken, in progress)
Ken: tasks go to a task area **and** are stored in Krypu; notes are stored in Krypu; next time you call, Krypu reminds
you ("Is your daughter Ava feeling better?").
- **Done:** `src/ai.js` `analyzeNote()` now returns `{tasks, follow_ups, facts}` (Claude prompt + zod schema updated;
  no-AI fallback turns news like "sick/interview/trip" into follow-ups). `src/memory.js` has the data helpers
  (`recordCall`, `addTasks`, `toggleTask`, `markAsked`, `personMemory`). `settings.js` has `tasks: []`, `calls: {}`.
- **DONE 2026-09-27 (web-tested, not yet on the phone):**
  - "Save note" always records the call (note + follow-ups + facts) in the person's history, even with no tasks.
  - Tasks go on Krypu's own list wherever else you send them, plus a "Keep in Krypu only" option.
  - **Before you call** on the person's sheet: things to ask about (with Asked ✓), facts, open tasks, last 3 calls.
  - New **Tasks** screen (✓ n button beside the gear).
  - Also fixed: opening Home straight from a link with after-call params crashed (setParams before the navigator mounted).
- **Was the to-do list:**
  1. After "Find tasks": call `recordCall()` with the note + follow-ups + facts (also when there are no tasks) and
     `addTasks()` for ticked tasks - always, whichever external target is chosen; add a "Keep in Krypu only" option.
  2. Person sheet, top: **Before you call** - open follow-ups ("Ask if Ava is feeling better", with an "Asked ✓" to
     clear), facts ("Daughter: Ava"), open tasks with checkboxes, and recent calls (date · app · note).
  3. New **Tasks** screen (`src/app/tasks.js`, button on home): open tasks grouped by person, tick to complete,
     completed list below.
  4. Replace the "append tasks to person notes" line in TasksPopup with the above.

## Look and feel
**Personal styling, not REMAX corporate colours.** This is a household app — warm and plain, nothing
that looks like a work tool.

## Stack
Expo / React Native, reusing the DropFile setup (`~/projects/quantum/dropfile`):
`expo-web-browser` for Custom Tabs, `expo-linking` for the intent filter, `expo-sharing`/intent for the nudge.
Fallback to native Kotlin if Expo can't configure the intent filter or preserve the fragment properly.

## Honest alternative
WhatsApp or Google Meet group calls work on all five phones today with no build and no lobby. This project
is only worth it if the three Apple users won't move off FaceTime — which is usually the real situation.

## Notes
- 2026-09-23: project opened; use case and design captured. Nothing built yet.
- 2026-09-24: added "Ask for link" SMS flow and decided links are stored on the Android contact card (URL field, label "FaceTime"); on GitHub (public): https://github.com/kenpeterlin1-source/krypu
- 2026-09-24: logo chosen: **summit camera** (concept 3) - camera on topo rings. Icon set generated by `node tools/make_icons.mjs` (sources in `assets/logo/`).
- 2026-09-24: direction changed to a contacts-first, multi-platform video launcher (FaceTime first; WhatsApp via native module in v1.1).
- 2026-09-24: added Teams and Slack (URL-based) to the platform list (Ken).
- 2026-09-24: added Jitsi, including "Start a Jitsi room" for anyone as the no-app fallback (Ken).
- 2026-09-24: app will get a web page at **peterlin.com/<appname>** (served from the peterlin.com Cloudflare site, `site/<appname>/`). APK downloads stay on apps.peterlin.com. Name: Krypu → peterlin.com/krypu.
- 2026-09-24: **renamed to Krypu** (package com.peterlin.krypu). Checked: no existing app by that name; krypu.com and krypu.app unregistered.
- 2026-09-24 (end of session): renamed GitHub repo → kenpeterlin1-source/krypu and folder → ~/personal/krypu.
- 2026-09-24: added group Jitsi calls (multi-select). Snapchat/Instagram: later, open-chat tier only.
- 2026-09-24: web page built at peterlin-com-website/site/krypu/ (→ peterlin.com/krypu). "Ask for link" texts should link to https://peterlin.com/krypu/#<platform> for the steps.
- 2026-09-24: added "your rooms": host with your own permanent Zoom/Meet/Teams/Jitsi room; group calls can use any of them.
- 2026-09-24: Expo Router; first-run platform picker; Settings (toggles, your rooms, version + update check); in-app update check.
- 2026-09-24: "did it work?" check after each call; failed links route back to fix them. App now follows ~/projects/_templates/expo-app (update.js from template, scripts/release.sh, extra.releasesRepo).
- 2026-09-24: added Voice (phone dialer, WhatsApp voice) and private per-person notes.
- 2026-09-24: added local time per person (guessed from the number, overridable) with a late-night warning.
- 2026-09-24: after-call notes → tasks (Claude or on-phone fallback), save to Google Tasks/Calendar/Email/Text with remembered default; AI provider choice in setup.
- 2026-09-24: **v0.1.0 published** (first test build = web mock-up with sample people): https://github.com/kenpeterlin1-source/krypu/releases/latest. APK 107 MB (all ABIs - split per ABI later).
- 2026-09-24: **BUG (FIXED in 0.1.1): v0.1.0 on Ken's Android phone showed only the topo background - no text/buttons, no crash.** Web preview works. No logs yet: Mac USB is disabled → use Wireless debugging (adb pair <ip:port> + code, then adb connect <ip:port>; Mac must be off the work VPN), then `adb logcat *:E ReactNativeJS:V`. Fix → publish 0.1.1 (update banner should appear).
- 2026-09-24: **0.1.1** - cause of the blank screen: the topo map was an absolutely-positioned sibling of the content
  (react-native-svg, and a plain Image too) and on Android's new renderer it hid everything, zIndex or not. Fix: the map
  is the screen's `ImageBackground` (pre-rendered PNGs per theme, `node tools/make_topo_png.mjs`). Also: Android
  clipped text beside flexible siblings (local time now on its own line). Debugging: Ken's Pixel 9 Pro XL over
  **Wireless debugging** (adb pair/connect) + `npx expo run:android` dev build with live logs.
- **Resume Fri 2026-09-26:** **0.1.1 is published** (https://github.com/kenpeterlin1-source/krypu/releases/latest) -
  install it on the phone to replace the dev build (the dev build needs this Mac's Metro to run). Then: the NEXT list
  above (remember people between calls).
- 2026-09-25: **0.1.2** tested end to end on Ken's Pixel 9 Pro XL (release APK): setup, AI picker, home, sheet, time-zone
  change, notes, Settings (Zoom room, update check vs GitHub → "up to date"), back gesture, group picker, restart
  persistence, did-it-work → notes → tasks → **Save to Calendar opened Google Calendar with the event pre-filled on
  kenpeterlin1@gmail.com** (discarded, nothing saved), remembered default, both link-failure paths. Fixed: ☏ emoji →
  dots, sheets clear the gesture bar, mock goes straight to "did it work?" (no real link to open yet).
  Not tested: Text/Email/Google Tasks targets, Claude extraction (no API key on the phone yet), light mode.
- 2026-09-25: **Real contacts + real calls** (in testing, not released): `src/contacts.js` (expo-contacts, new
  class API: `Contact.getAllDetails([FULL_NAME, PHONES, URL_ADDRESSES])`, links = URL entries matched by
  `detectPlatform`, `saveLink()` → `addUrlAddress({label: 'FaceTime', url})`), permission card on home.
  `src/launch.js`: FaceTime → Chrome Custom Tab (expo-web-browser), other links → app, WhatsApp by number →
  wa.me chat, phone → dialer; texts are pre-filled and **you press Send**. Multi-step calls run as a queue, one step
  each time you come back to Krypu (e.g. text "I'm on FaceTime" → open the link; group: one text per person → room).
- **iPhone people** (Ken: most contacts have no links; asked people need brief steps + to know they must let him in):
  `src/app/iphones.js` "Who has an iPhone?" - pre-ticks numbers labelled "iPhone" (Android can't detect iPhones;
  bubble colour is an iPhone-only feature), you tick the rest (`settings.iphone`), **Ask N people** sends each the
  FaceTime-link steps one by one and records `settings.asked`. Home shows an "iPhone" chip and an entry card when
  few people have links. **Copied-link banner:** when Krypu opens with a video link on the clipboard (copied from
  their reply) it offers "Save to <person you asked most recently>" or someone else you asked.
- **Saved groups** (Ken): in group mode, chips like "Family · 5" select members; "+ Save these N as a group";
  long-press to delete (`settings.groups`).
- 2026-09-25 (paused for a meeting): **automatic link capture - built, compiled, NOT yet tested on the phone.**
  - `modules/krypu-messages` (local Expo module, Kotlin): `scanSms()` reads received SMS/MMS for call links
    (READ_SMS), `LinkListener` (NotificationListenerService) keeps call links from Google/Samsung Messages
    notifications (covers RCS) in SharedPreferences, `takeFound()` hands them over, `isWatching()` /
    `openWatchSettings()` for Notification access.
  - `src/messages.js`: old texts matched to contacts by last 10 digits of the number; new ones by sender name as
    Messages shows it; saved onto the card if they don't already have a link for that platform. Home shows "Saved
    from your texts"; Settings → "Links from your texts": **Find links in my old texts** + **Watch new texts
    automatically** (sideloaded app → Android may call Notification access a restricted setting: App info → ⋮ →
    Allow restricted settings).
  - Also since 0.1.3 (unreleased): iPhone people shown with a blue avatar + "iPhone · asked" chip; asking for a
    FaceTime link marks them as iPhone; full phone-prefix → time-zone table from Google libphonenumber
    (`tools/gen_phone_zones.py` → `src/phoneZones.js`; fixes Kate's 484 "unknown").
  - **Resume:** unlock phone → dev build (`npx expo start --dev-client`, adb reverse tcp:8081) → Settings → Find links
    in my old texts (Ken allows SMS; expect Willow's old FaceTime link) → Watch new texts (Ken enables Notification
    access) → wait for Kate's reply (asked 2026-09-25 08:31) → release 0.1.4.
- 2026-09-25 **MILESTONE: first real FaceTime call Android → iPhone through Krypu (Ken → Kate).** Flow: ask from
  Krypu (Kate needed clearer steps - on newer iOS, Create Link is under New FaceTime / + → Create Link) → Kate sent
  the link → copied → Krypu's "You copied a FaceTime link → Save to Kate Peterlin" → Kate's card → FaceTime →
  Chrome Custom Tab "Waiting to be let in…" → text Kate → she let him in. Works.
  Learned / to fix:
  1. Reopening Krypu (launcher) while the FaceTime Custom Tab is open **closes the call** - keep the Custom Tab
     alive (launchMode/`showInRecents`, or open FaceTime in Chrome proper instead of a Custom Tab).
  2. FaceTime button sends the "I'm on FaceTime" nudge every time - skip it if you texted them in the last few min,
     and make the nudge say "tap the notification to let me in".
  3. **Automatic link capture is blocked on Android 17 for browser-installed apps**: Notification access and SMS are
     "restricted settings" and even "Allow restricted settings" didn't unlock them. Apps installed from a computer
     (adb) aren't restricted - reinstall via adb (clears Krypu's own data; links on contact cards stay) or keep
     copy → Krypu. Ken chose copy for now.
- 2026-09-25: **0.1.4** - FaceTime opens in Chrome itself (expo-intent-launcher → com.android.chrome, fallback
  default browser) so returning to Krypu never closes the call; FaceTime nudge skipped if Krypu texted them in the
  last 10 min (`settings.lastText`) and now says "tap the notification on your iPhone to let me in"; clearer
  request steps; full time-zone table; blue iPhone people; contacts-listener fix.
- **NEXT (0.1.5, Ken's idea): call + notes together** - Chrome **Partial Custom Tab** (androidx.browser,
  `setInitialActivityHeightPx` ≈ 2/3 screen, `setBackgroundInteractionEnabled(true)`, needs a bound
  CustomTabsSession) in `modules/krypu-messages` (or a new module): Krypu shows person + notes in the top third,
  the FaceTime call docks in the bottom two-thirds (Chrome only docks partial tabs at the bottom).
- 2026-09-25 (paused - Ken switched to the lake house project): **0.1.5 split screen built, not yet tested on the
  phone.** `modules/krypu-call-tab` (Chrome partial tab, `setInitialActivityHeightPx`, `setBackgroundInteractionEnabled`,
  shown/hidden events), `src/callTab.js`, `src/app/call.js` (top third: person, local time, your notes, "notes from
  this call"; after close: Rejoin / Done → tasks from call notes / Link didn't work). Home routes FaceTime there when
  Chrome is available. Dev-only test: open `/call?id=<contact id>&testUrl=https://example.com` so nothing rings.
  Resume: unlock phone → dev server → test layout with testUrl → real call with Kate → release 0.1.5.

- 2026-09-25 (evening): **0.1.5 dev build installed on the phone** (signed with the same debug key as 0.1.4, so it
  installed over it and kept Krypu's data). Test not run yet - the phone kept locking. Kate Peterlin's contact id is
  **1823**.
  - **Resume:** home Wi-Fi, reconnect Wireless debugging, `npx expo start --dev-client` in `krypu/`,
    `adb reverse tcp:8081 tcp:8081`.
  - Open `krypu://call?id=1823&testUrl=https%3A%2F%2Fexample.com`.
  - Turn on Developer options → Stay awake on the phone first.
- **Rename (Ken doesn't like "Krypu"):** web + store check 2026-09-25.
  - **Contact Summit** is the favourite. No app uses it; contactsummit.com is taken (2020, Unstoppable Domains), so
    look at contactsummit.app / getcontactsummit.com. Check the USPTO trademark database before renaming.
  - Also free of apps: FaceNear (.com taken since 2004) and Facevy (.com taken 2020).
  - Taken by other apps: Facely (5+ apps), SeeMe ("SeeMe Live Calls" is a video-call app), Facelift, Facelink,
    Faceli, Kallo/Kalla.
  - The rename touches the app name, package id, GitHub repo, update checks (`releasesRepo`) and the web page, so do it
    once.
- 2026-09-27: **Name decided: Contact Summit.** Rename happens **at the end, once the prototype works**.
  - Keep the Android app id `com.peterlin.krypu`, so updates install over the current app and keep its data. Only the
    visible name, repo, web page and `releasesRepo` change.
  - Domains available on 2026-09-27: contactsummit.app (preferred), getcontactsummit.com, contactsummitapp.com,
    contactsummit.net. Ken buys one at Cloudflare.
  - Trademark: web search found no "Contact Summit" mark. Ken to confirm on tmsearch.uspto.gov before launch.
