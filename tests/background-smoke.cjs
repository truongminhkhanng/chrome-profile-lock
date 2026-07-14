const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const data = {};
const openTabs = [];
const event = () => ({ listener: null, addListener(fn) { this.listener = fn; } });
const chrome = {
  storage: { local: {
    async get(keys) { return Object.fromEntries(keys.filter(key => key in data).map(key => [key, data[key]])); },
    async set(patch) { Object.assign(data, patch); },
    async clear() { for (const key of Object.keys(data)) delete data[key]; }
  } },
  runtime: { getURL: file => `chrome-extension://test/${file}`, onInstalled: event(), onStartup: event(), onMessage: event() },
  tabs: {
    async query() { return [...openTabs]; }, async create() { return { id: 1 }; }, async update() {}, async sendMessage() {},
    async remove() {}, async get() { return null; }, onActivated: event(), onUpdated: event(), onRemoved: event()
  },
  windows: { async update() {}, onFocusChanged: event(), WINDOW_ID_NONE: -1 },
  idle: { setDetectionInterval() {}, onStateChanged: event() },
  alarms: { create() {}, onAlarm: event() }
};

const context = vm.createContext({
  chrome, crypto: webcrypto, btoa, atob, URL, TextEncoder, console, setTimeout, clearTimeout
});
context.importScripts = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), context, { filename: 'background.js' });

(async () => {
  let state = await context.getState();
  const setup = await context.setupPassword({ password: 'Strong Password 42!' }, state);
  assert.equal(setup.ok, true);
  assert.match(setup.recoveryCode, /^PL-(?:[A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);

  state = await context.getState();
  assert.equal(state.profiles.length, 1);
  assert.equal(state.profiles[0].credential.algorithm, 'PBKDF2-SHA256');
  assert.equal(state.passwordHash, null);

  const wrong = await context.handleUnlock({ secret: 'wrong', mode: 'password' }, state);
  assert.equal(wrong.ok, false);
  state = await context.getState();
  const unlocked = await context.handleUnlock({ secret: 'Strong Password 42!', mode: 'password' }, state);
  assert.equal(unlocked.ok, true);
  assert.equal((await context.getState()).isLocked, false);

  state = await context.getState();
  await context.setState({ protectedSites: ['example.com'], allowedSites: [], focusDomains: [] });
  state = await context.getState();
  assert.equal(context.getPageAccess('https://sub.example.com/private', state).reason, 'site');
  await context.setState({ allowedSites: ['sub.example.com'] });
  state = await context.getState();
  assert.equal(context.getPageAccess('https://sub.example.com/private', state).blocked, false);

  await context.setState({ siteUnlocks: { 'secure.example': Date.now() + 60000 } });
  openTabs.push({ id: 7, url: 'https://secure.example/account' });
  await context.pruneSiteUnlocks();
  assert.equal((await context.getState()).siteUnlocks['secure.example'] > Date.now(), true);
  openTabs.length = 0;
  await context.pruneSiteUnlocks();
  assert.equal(Object.keys((await context.getState()).siteUnlocks).length, 0);

  const profile = context.getActiveProfile(state);
  assert.equal(await context.verifyProfileSecret(profile, setup.recoveryCode, 'recovery'), true);
  assert.equal(await context.verifyProfileSecret(profile, 'Strong Password 42!', 'site'), true);
  const siteProfile = { ...profile, siteCredential: await context.PLcrypto.createCredential('Website Secret 77!') };
  assert.equal(await context.verifyProfileSecret(siteProfile, 'Website Secret 77!', 'site'), true);
  assert.equal(await context.verifyProfileSecret(siteProfile, 'Strong Password 42!', 'site'), false);

  const legacyPassword = ' Mật khẩu cũ 9! ';
  const legacy = { id: 'legacy', name: 'Cũ', credential: null, legacyHash: await context.PLcrypto.sha256Hex(legacyPassword) };
  await context.setState({ profiles: [legacy], activeProfileId: 'legacy', passwordHash: legacy.legacyHash, isLocked: true });
  state = await context.getState();
  assert.equal((await context.handleUnlock({ secret: legacyPassword, mode: 'password' }, state)).ok, true);
  const migrated = context.getActiveProfile(await context.getState());
  assert.equal(migrated.legacyHash, undefined);
  assert.equal(migrated.credential.algorithm, 'PBKDF2-SHA256');
  console.log('Background smoke test: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
