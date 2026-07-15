const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'src');
const data = {};
const openTabs = [];
const notifications = [];
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
  alarms: { create() {}, onAlarm: event() },
  notifications: { async create(id, options) { notifications.push({ id, options }); } },
  commands: { onCommand: event() },
  webNavigation: { onCommitted: event() }
};

const context = vm.createContext({
  chrome, crypto: webcrypto, btoa, atob, URL, TextEncoder, console, setTimeout, clearTimeout
});
context.importScripts = file => vm.runInContext(fs.readFileSync(path.join(sourceRoot, file), 'utf8'), context, { filename: file });
vm.runInContext(fs.readFileSync(path.join(sourceRoot, 'background.js'), 'utf8'), context, { filename: 'background.js' });

(async () => {
  let state = await context.getState();
  const setup = await context.setupPassword({ password: '4826', pinLength: 4 }, state);
  assert.equal(setup.ok, true);
  assert.match(setup.recoveryCode, /^PL-(?:[A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);

  state = await context.getState();
  assert.equal(state.profiles.length, 1);
  assert.equal(state.profiles[0].credential.algorithm, 'PBKDF2-SHA256');
  assert.equal(state.passwordHash, null);

  const wrong = await context.handleUnlock({ secret: 'wrong', mode: 'password' }, state);
  assert.equal(wrong.ok, false);
  state = await context.getState();
  const unlocked = await context.handleUnlock({ secret: '4826', mode: 'password' }, state);
  assert.equal(unlocked.ok, true);
  assert.equal((await context.getState()).isLocked, false);

  state = await context.getState();
  await context.setState({ protectedSites: ['example.com'], allowedSites: [], focusDomains: [] });
  state = await context.getState();
  assert.equal(context.getPageAccess('https://sub.example.com/private', state).reason, 'site');
  await context.setState({ allowedSites: ['sub.example.com'] });
  state = await context.getState();
  assert.equal(context.getPageAccess('https://sub.example.com/private', state).blocked, false);
  await context.setState({ isLocked: true });
  state = await context.getState();
  assert.equal(context.getPageAccess('https://sub.example.com/private', state).blocked, false);
  assert.equal(context.getPageAccess('https://other.example/private', state).reason, 'global');
  await context.setState({ isLocked: false });

  await context.setState({ siteUnlocks: { 'secure.example': Date.now() + 60000 } });
  openTabs.push({ id: 7, url: 'https://secure.example/account' });
  await context.pruneSiteUnlocks();
  assert.equal((await context.getState()).siteUnlocks['secure.example'] > Date.now(), true);
  openTabs.length = 0;
  await context.pruneSiteUnlocks();
  assert.equal(Object.keys((await context.getState()).siteUnlocks).length, 0);

  const profile = context.getActiveProfile(state);
  assert.equal(await context.verifyProfileSecret(profile, setup.recoveryCode, 'recovery'), true);
  assert.equal(await context.verifyProfileSecret(profile, '4826', 'site'), true);
  const siteProfile = { ...profile, siteCredential: await context.PLcrypto.createCredential('7391') };
  assert.equal(await context.verifyProfileSecret(siteProfile, '7391', 'site'), true);
  assert.equal(await context.verifyProfileSecret(siteProfile, '4826', 'site'), false);

  const legacyPassword = ' Mật khẩu cũ 9! ';
  const legacy = { id: 'legacy', name: 'Cũ', credential: null, legacyHash: await context.PLcrypto.sha256Hex(legacyPassword) };
  await context.setState({ profiles: [legacy], activeProfileId: 'legacy', passwordHash: legacy.legacyHash, isLocked: true });
  state = await context.getState();
  assert.equal((await context.handleUnlock({ secret: legacyPassword, mode: 'password' }, state)).ok, true);
  const migrated = context.getActiveProfile(await context.getState());
  assert.equal(migrated.legacyHash, undefined);
  assert.equal(migrated.credential.algorithm, 'PBKDF2-SHA256');

  await chrome.runtime.onInstalled.listener({ reason: 'update' });
  state = await context.getState();
  assert.equal(state.profiles.length, 0);
  assert.equal(state.activeProfileId, null);
  assert.equal(state.isLocked, true);
  assert.equal(data.factoryResetVersion, '1.0.0');

  await context.setState({ autoLockMinutes: 99 });
  await chrome.runtime.onInstalled.listener({ reason: 'update' });
  assert.equal((await context.getState()).autoLockMinutes, 99);

  const shortPassword = await context.setupPassword({ password: '1' }, await context.getState());
  assert.equal(shortPassword.ok, false);
  const pinSetup = await context.setupPassword({ password: '1234', pinLength: 4 }, await context.getState());
  assert.equal(pinSetup.ok, true);
  state = await context.getState();
  const changed = await context.changePassword({ oldPassword: '1234', newPassword: '654321', pinLength: 6 }, state);
  assert.equal(changed.ok, true);
  state = await context.getState();
  assert.equal(state.pinLength, 6);
  assert.equal(await context.verifyProfileSecret(context.getActiveProfile(state), '654321'), true);

  const profileBeforeReset = context.getActiveProfile(state);
  await context.setState({ theme: 'dark', accentColor: '#ff0000', protectedSites: ['example.com'], focusUntil: Date.now() + 60000 });
  const reset = await context.resetSettingsToDefaults();
  assert.equal(reset.ok, true);
  state = await context.getState();
  assert.equal(state.theme, 'system');
  assert.equal(state.accentColor, '#5753d9');
  assert.equal(state.protectedSites.length, 0);
  assert.equal(state.focusUntil, 0);
  assert.equal(JSON.stringify(context.getActiveProfile(state)), JSON.stringify(profileBeforeReset));
  assert.equal(state.logs[0].action, 'SETTINGS_RESET');

  await context.setState({ failedAttempts: 4, lockoutUntil: 0, isLocked: true });
  state = await context.getState();
  const lockedOut = await context.handleUnlock({ secret: 'wrong', mode: 'password' }, state);
  assert.equal(lockedOut.lockedOut, true);
  assert.equal(lockedOut.secsLeft, 60);
  assert.equal(notifications.length, 1);
  assert.equal(typeof chrome.commands.onCommand.listener, 'function');
  assert.equal(typeof chrome.webNavigation.onCommitted.listener, 'function');

  state = await context.getState();
  assert.equal((await context.factoryReset({ password: '000000' }, state)).ok, false);
  assert.equal((await context.factoryReset({ password: '654321' }, state)).ok, true);
  state = await context.getState();
  assert.equal(state.profiles.length, 0);
  assert.equal(state.activeProfileId, null);
  assert.equal(state.logs.length, 0);
  assert.equal(state.isLocked, true);
  console.log('Background smoke test: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
