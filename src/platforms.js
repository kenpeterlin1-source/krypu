// Video platforms the app knows how to detect on a contact and launch.
// Colours come from the personal palette (not the platforms' own brand colours).

export const PLATFORMS = {
  facetime: {
    label: 'FaceTime',
    tone: 'clay',
    // full URL incl. the #fragment - the joining secret lives there
    match: (url) => /^https:\/\/facetime\.apple\.com\/join#/i.test(url),
    how: 'Texts them that you are waiting, then opens their FaceTime link. They let you in from their iPhone.',
  },
  whatsapp: {
    label: 'WhatsApp',
    tone: 'sage',
    match: (url) => /^https:\/\/(call\.whatsapp\.com|wa\.me)\//i.test(url),
    how: 'Starts a WhatsApp video call straight away.',
  },
  zoom: {
    label: 'Zoom',
    tone: 'sky',
    match: (url) => /^https:\/\/([a-z0-9-]+\.)?zoom\.us\/j\//i.test(url),
    how: 'Opens their Zoom room in the Zoom app.',
  },
  meet: {
    label: 'Meet',
    tone: 'sand',
    match: (url) => /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i.test(url),
    how: 'Opens their Google Meet link in the Meet app.',
  },
  teams: {
    label: 'Teams',
    tone: 'plum',
    // personal (teams.live.com/meet) and work (teams.microsoft.com/l/meetup-join or /l/call) links
    match: (url) => /^https:\/\/(teams\.live\.com\/meet\/|teams\.microsoft\.com\/l\/(meetup-join|call)\/)/i.test(url),
    how: 'Opens their Teams meeting or call in the Teams app.',
  },
  slack: {
    label: 'Slack',
    tone: 'slate',
    // a huddle link copied from a DM or channel; both people must be in that workspace
    match: (url) => /^https:\/\/(app\.slack\.com\/huddle\/|[a-z0-9-]+\.slack\.com\/)/i.test(url),
    how: 'Opens your Slack huddle with them in the Slack app.',
  },
  jitsi: {
    label: 'Jitsi',
    tone: 'moss',
    // no account or app needed for the guest; the app can also create a fresh room for anyone (newJitsiRoom)
    match: (url) => /^https:\/\/meet\.jit\.si\/[^/?#]+/i.test(url),
    how: 'Opens a Jitsi room in the browser or Jitsi app. Nothing to install for them.',
  },
};

export const PLATFORM_ORDER = ['facetime', 'whatsapp', 'zoom', 'meet', 'teams', 'slack', 'jitsi'];

// A hard-to-guess room name, e.g. https://meet.jit.si/summit-k7q2m9x4t1b8
export function newJitsiRoom() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const id = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `https://meet.jit.si/summit-${id}`;
}

export function detectPlatform(url) {
  return PLATFORM_ORDER.find((key) => PLATFORMS[key].match(url)) ?? null;
}

// Platforms whose calls run inside Krypu (call screen: video on top, notes below), because they have a web version
// that works in the in-app browser. The rest open their own app; notes come after the call.
export const IN_APP = ['facetime', 'jitsi', 'zoom'];

// The web address to load in the call screen for a link, or null if it can't run in-app. Your display name goes into the
// link where the platform supports it (FaceTime has no such option; the call screen types it into the page instead).
export function inAppUrl(platform, url, name = '') {
  if (!url) return null;
  if (platform === 'facetime') return url;
  // Jitsi on a phone browser pushes its app unless deep linking is off; the name is a config option in the #fragment
  if (platform === 'jitsi') {
    const opts = ['config.disableDeepLinking=true', name && `userInfo.displayName=${encodeURIComponent(JSON.stringify(name))}`].filter(Boolean);
    return `${url}${url.includes('#') ? '&' : '#'}${opts.join('&')}`;
  }
  // Zoom meeting links → Zoom's web client (join from the browser), passcode kept, name as ?uname=
  if (platform === 'zoom') {
    const m = url.match(/zoom\.us\/j\/(\d+)(\?[^#]*)?/i);
    if (!m) return null;
    const q = new URLSearchParams((m[2] ?? '').slice(1));
    if (name) q.set('uname', name);
    return `https://app.zoom.us/wc/join/${m[1]}${q.toString() ? `?${q}` : ''}`;
  }
  return null;
}
