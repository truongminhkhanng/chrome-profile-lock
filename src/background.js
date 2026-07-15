importScripts('crypto.js');

const LOCK_TAB_URL = chrome.runtime.getURL('src/lock.html');
const OPTIONS_URL = chrome.runtime.getURL('src/options.html');
const MAX_LOGS = 200;
const SITE_SESSION_MS = 30 * 60 * 1000;
const FACTORY_RESET_VERSION = '1.0.0';

const DEFAULTS = {
  schemaVersion: 2,
  isLocked: true,
  passwordHash: null,
  profiles: [],
  activeProfileId: null,
  pinLength: 4,
  autoLockMinutes: 15,
  lockOnStartup: true,
  lockOnSystemLock: true,
  theme: 'system',
  accentColor: '#5753d9',
  customGreeting: 'Chào mừng trở lại',
  protectedSites: [],
  allowedSites: [],
  focusDomains: [],
  focusUntil: 0,
  siteUnlocks: {},
  pendingUnlockHost: null,
  pendingUnlockReason: null,
  sessionNonce: null,
  lastActivityAt: 0,
  lastHeartbeatAt: 0,
  failedAttempts: 0,
  lockoutUntil: 0,
  recoveryAuthorizedUntil: 0,
  lastLockReason: null,
  logs: []
};

async function getState() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

async function setState(patch) {
  await chrome.storage.local.set(patch);
}

function publicProfile(profile) {
  return profile ? {
    id: profile.id,
    name: profile.name,
    hasPin: !!profile.pinCredential,
    hasSitePassword: !!profile.siteCredential,
    hasRecovery: !!profile.recoveryCredential
  } : null;
}

function getActiveProfile(state) {
  return state.profiles.find(profile => profile.id === state.activeProfileId) || state.profiles[0] || null;
}

function makeId() {
  return `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

function normalizeHost(value) {
  let text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  try {
    if (!text.includes('://')) text = `https://${text}`;
    text = new URL(text).hostname;
  } catch {
    text = text.replace(/^\*\./, '').split('/')[0].split(':')[0];
  }
  return text.replace(/^www\./, '').replace(/^\*\./, '');
}

function normalizeRules(values) {
  return [...new Set((Array.isArray(values) ? values : String(values || '').split(/[\n,]+/))
    .map(normalizeHost).filter(Boolean))].slice(0, 200);
}

function hostMatches(host, rules) {
  const clean = normalizeHost(host);
  return rules.some(rule => clean === rule || clean.endsWith(`.${rule}`));
}

function pageHost(url) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? normalizeHost(parsed.hostname) : '';
  } catch {
    return '';
  }
}

async function openSetupPage(wasReset = false) {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(tab => String(tab.url || '').startsWith(OPTIONS_URL));
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    return;
  }
  const suffix = wasReset ? '?setup=1&reset=1' : '?setup=1';
  await chrome.tabs.create({ url: `${OPTIONS_URL}${suffix}` });
}

async function addLog(action, details = '') {
  const state = await getState();
  const profile = getActiveProfile(state);
  const entry = {
    id: makeId(),
    at: Date.now(),
    action,
    details: String(details || '').slice(0, 180),
    profile: profile?.name || 'Mặc định'
  };
  await setState({ logs: [entry, ...(state.logs || [])].slice(0, MAX_LOGS) });
}

async function migrateLegacyState(state) {
  if (state.profiles.length || !state.passwordHash) return state;
  const profile = {
    id: makeId(),
    name: 'Mặc định',
    credential: null,
    legacyHash: state.passwordHash,
    pinCredential: null,
    siteCredential: null,
    recoveryCredential: null,
    createdAt: Date.now()
  };
  await setState({ profiles: [profile], activeProfileId: profile.id, schemaVersion: 2 });
  return { ...state, profiles: [profile], activeProfileId: profile.id };
}

async function hasSetup(state) {
  const migrated = await migrateLegacyState(state);
  return !!getActiveProfile(migrated);
}

async function verifyProfileSecret(profile, secret, mode = 'password') {
  if (!profile || !secret) return false;
  if (mode === 'pin') return PLcrypto.verifyCredential(secret, profile.pinCredential);
  if (mode === 'site') {
    if (profile.siteCredential) return PLcrypto.verifyCredential(secret, profile.siteCredential);
    return profile.credential
      ? PLcrypto.verifyCredential(secret, profile.credential)
      : (await PLcrypto.sha256Hex(secret)) === profile.legacyHash;
  }
  if (mode === 'recovery') return PLcrypto.verifyCredential(secret.toUpperCase(), profile.recoveryCredential);
  if (profile.credential) return PLcrypto.verifyCredential(secret, profile.credential);
  if (profile.legacyHash) return (await PLcrypto.sha256Hex(secret)) === profile.legacyHash;
  return false;
}

async function upgradeLegacyCredential(state, profile, secret) {
  if (!profile?.legacyHash) return profile;
  const updated = { ...profile, credential: await PLcrypto.createCredential(secret) };
  delete updated.legacyHash;
  const profiles = state.profiles.map(item => item.id === profile.id ? updated : item);
  await setState({ profiles, passwordHash: null });
  return updated;
}

function getPageAccess(url, state) {
  const host = pageHost(url);
  if (!host || url.startsWith(LOCK_TAB_URL) || url.startsWith(OPTIONS_URL)) {
    return { blocked: false, reason: null, host };
  }
  if (hostMatches(host, state.allowedSites || [])) return { blocked: false, reason: null, host };
  if (state.isLocked) return { blocked: true, reason: 'global', host };
  const now = Date.now();
  if (state.focusUntil > now && hostMatches(host, state.focusDomains || [])) {
    return { blocked: true, reason: 'focus', host, focusUntil: state.focusUntil };
  }
  if (hostMatches(host, state.protectedSites || []) && Number(state.siteUnlocks?.[host] || 0) <= now) {
    return { blocked: true, reason: 'site', host };
  }
  return { blocked: false, reason: null, host };
}

async function sendPageState(tab) {
  if (!tab?.id || !tab.url) return;
  const state = await getState();
  const access = { ...getPageAccess(tab.url, state), customGreeting: state.customGreeting };
  try { await chrome.tabs.sendMessage(tab.id, { type: 'PAGE_STATE_CHANGED', ...access }); } catch {}
}

async function broadcastPageStates() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(sendPageState));
}

async function pruneSiteUnlocks() {
  const state = await getState();
  const unlocks = state.siteUnlocks || {};
  if (!Object.keys(unlocks).length) return;
  const now = Date.now();
  const tabs = await chrome.tabs.query({});
  const openHosts = new Set(tabs.map(tab => pageHost(tab.url || '')).filter(Boolean));
  const siteUnlocks = Object.fromEntries(
    Object.entries(unlocks).filter(([host, expiresAt]) => Number(expiresAt) > now && openHosts.has(host))
  );
  if (Object.keys(siteUnlocks).length !== Object.keys(unlocks).length) {
    await setState({ siteUnlocks });
  }
}

async function openLockTab(context = {}) {
  if (context.host) {
    await setState({ pendingUnlockHost: context.host, pendingUnlockReason: context.reason || 'site' });
  }
  const tabs = await chrome.tabs.query({ url: LOCK_TAB_URL });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: LOCK_TAB_URL, active: true });
}

async function ensureSetup() {
  let state = await getState();
  state = await migrateLegacyState(state);
  if (!getActiveProfile(state)) {
    await setState({ isLocked: true });
    await openSetupPage(false);
    return false;
  }
  return true;
}

async function lockBrowser(reason = 'manual') {
  const state = await getState();
  if (!(await hasSetup(state))) return false;
  await setState({ isLocked: true, siteUnlocks: {}, lastLockReason: reason, pendingUnlockHost: null, pendingUnlockReason: null });
  await addLog('LOCK', reason);
  await broadcastPageStates();
  await openLockTab();
  return true;
}

async function unlockBrowser(state, mode) {
  const now = Date.now();
  if (state.pendingUnlockHost && state.pendingUnlockReason === 'site') {
    const siteUnlocks = { ...(state.siteUnlocks || {}), [state.pendingUnlockHost]: now + SITE_SESSION_MS };
    await setState({ siteUnlocks, pendingUnlockHost: null, pendingUnlockReason: null, failedAttempts: 0, lockoutUntil: 0 });
    await addLog('SITE_UNLOCK', state.pendingUnlockHost);
  } else {
    const patch = {
      isLocked: false,
      sessionNonce: String(now),
      lastActivityAt: now,
      failedAttempts: 0,
      lockoutUntil: 0,
      pendingUnlockHost: null,
      pendingUnlockReason: null,
      recoveryAuthorizedUntil: mode === 'recovery' ? now + 5 * 60000 : 0
    };
    await setState(patch);
    await addLog(mode === 'recovery' ? 'RECOVERY_UNLOCK' : 'UNLOCK', mode);
  }
  await broadcastPageStates();
  const tabs = await chrome.tabs.query({ url: LOCK_TAB_URL });
  for (const tab of tabs) try { await chrome.tabs.remove(tab.id); } catch {}
}

function lockoutDuration(attempts) {
  if (attempts < 5) return 0;
  const tier = Math.floor((attempts - 5) / 2);
  return Math.min(15 * 60, 60 * (2 ** tier));
}

async function handleUnlock(message, state) {
  state = await migrateLegacyState(state);
  const profile = getActiveProfile(state);
  if (!profile) return { ok: false, error: 'Chưa thiết lập mật khẩu.' };
  const now = Date.now();
  if (state.lockoutUntil > now) {
    const secsLeft = Math.ceil((state.lockoutUntil - now) / 1000);
    return { ok: false, error: `Quá nhiều lần sai. Thử lại sau ${secsLeft} giây.`, lockedOut: true, secsLeft };
  }
  const mode = state.pendingUnlockReason === 'site'
    ? 'site'
    : (message.mode === 'recovery' ? 'recovery' : 'password');
  const valid = await verifyProfileSecret(profile, String(message.secret || ''), mode);
  if (valid) {
    if (mode === 'password' || (mode === 'site' && !profile.siteCredential)) await upgradeLegacyCredential(state, profile, message.secret);
    await unlockBrowser(state, mode);
    return { ok: true, recovered: mode === 'recovery' };
  }
  const attempts = Number(state.failedAttempts || 0) + 1;
  const delay = lockoutDuration(attempts);
  const lockoutUntil = delay ? now + delay * 1000 : 0;
  await setState({ failedAttempts: attempts, lockoutUntil });
  await addLog('FAILED_UNLOCK', `${mode}:${attempts}`);
  if (attempts === 5) {
    try {
      await chrome.notifications.create('unlock-warning', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('src/assets/icon128.png'),
        title: 'Cảnh báo mở khóa thất bại',
        message: 'Đã có 5 lần nhập sai liên tiếp. Profile tạm khóa trong 60 giây.',
        priority: 2
      });
    } catch {}
  }
  if (delay) return { ok: false, lockedOut: true, secsLeft: delay, error: `Sai quá nhiều lần. Khóa tạm ${delay} giây.` };
  return { ok: false, error: `Thông tin mở khóa không đúng. Còn ${5 - attempts} lần thử.`, failedAttempts: attempts };
}

function sanitizedSettings(state) {
  const active = getActiveProfile(state);
  return {
    extensionVersion: chrome.runtime.getManifest().version,
    isLocked: !!state.isLocked,
    needsSetup: !active,
    activeProfileId: active?.id || null,
    activeProfile: publicProfile(active),
    profiles: state.profiles.map(publicProfile),
    autoLockMinutes: Number(state.autoLockMinutes || 0),
    pinLength: Number(state.pinLength) === 6 ? 6 : 4,
    lockOnStartup: state.lockOnStartup !== false,
    lockOnSystemLock: state.lockOnSystemLock !== false,
    theme: state.theme || 'system',
    accentColor: /^#[0-9a-f]{6}$/i.test(state.accentColor || '') ? state.accentColor : '#5753d9',
    customGreeting: String(state.customGreeting || 'Chào mừng trở lại').slice(0, 80),
    protectedSites: state.protectedSites || [],
    allowedSites: state.allowedSites || [],
    focusDomains: state.focusDomains || [],
    focusUntil: Number(state.focusUntil || 0),
    failedAttempts: Number(state.failedAttempts || 0),
    lockoutUntil: Number(state.lockoutUntil || 0),
    lastActivityAt: Number(state.lastActivityAt || 0),
    autoLockAt: !state.isLocked && state.autoLockMinutes > 0 ? state.lastActivityAt + state.autoLockMinutes * 60000 : 0,
    unlockContext: state.pendingUnlockHost ? { reason: state.pendingUnlockReason, host: state.pendingUnlockHost } : null,
    canResetWithRecovery: Number(state.recoveryAuthorizedUntil || 0) > Date.now()
  };
}

async function setupPassword(message, state) {
  if (getActiveProfile(await migrateLegacyState(state))) return { ok: false, error: 'Mật khẩu đã được tạo.' };
  const pinLength = Number(message.pinLength) === 6 ? 6 : 4;
  if (!new RegExp(`^\\d{${pinLength}}$`).test(String(message.password || ''))) return { ok: false, error: `Mã PIN phải gồm đúng ${pinLength} chữ số.` };
  const recoveryCode = PLcrypto.generateRecoveryCode();
  const profile = {
    id: makeId(),
    name: String(message.name || 'Mặc định').trim().slice(0, 40) || 'Mặc định',
    credential: await PLcrypto.createCredential(message.password),
    pinCredential: null,
    siteCredential: null,
    recoveryCredential: await PLcrypto.createCredential(recoveryCode),
    createdAt: Date.now()
  };
  await setState({ profiles: [profile], activeProfileId: profile.id, passwordHash: null, pinLength, isLocked: true });
  await addLog('SETUP', profile.name);
  await openLockTab();
  return { ok: true, recoveryCode };
}

async function changePassword(message, state) {
  state = await migrateLegacyState(state);
  const active = getActiveProfile(state);
  const recoveryReset = Number(state.recoveryAuthorizedUntil || 0) > Date.now();
  if (!active || (!recoveryReset && !(await verifyProfileSecret(active, message.oldPassword, 'password')))) return { ok: false, error: 'Mật khẩu hiện tại không đúng.' };
  const pinLength = Number(message.pinLength) === 6 ? 6 : 4;
  if (!new RegExp(`^\\d{${pinLength}}$`).test(String(message.newPassword || ''))) return { ok: false, error: `Mã PIN mới phải gồm đúng ${pinLength} chữ số.` };
  const recoveryCode = recoveryReset ? PLcrypto.generateRecoveryCode() : null;
  const updated = { ...active, credential: await PLcrypto.createCredential(message.newPassword) };
  if (recoveryCode) updated.recoveryCredential = await PLcrypto.createCredential(recoveryCode);
  delete updated.legacyHash;
  await setState({ profiles: state.profiles.map(item => item.id === active.id ? updated : item), passwordHash: null, pinLength, isLocked: true, recoveryAuthorizedUntil: 0 });
  await addLog('PASSWORD_CHANGE');
  await broadcastPageStates();
  await openLockTab();
  return { ok: true, recoveryCode };
}

chrome.runtime.onInstalled.addListener(async details => {
  if (details?.reason === 'update') {
    const stored = await chrome.storage.local.get(['factoryResetVersion']);
    if (stored.factoryResetVersion !== FACTORY_RESET_VERSION) {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({
        ...DEFAULTS,
        factoryResetVersion: FACTORY_RESET_VERSION,
        lastActivityAt: Date.now(),
        lastHeartbeatAt: Date.now()
      });
      await openSetupPage(true);
      return;
    }
  }
  await setState({ lastActivityAt: Date.now(), lastHeartbeatAt: Date.now() });
  await ensureSetup();
});

chrome.runtime.onStartup.addListener(async () => {
  const ready = await ensureSetup();
  const state = await getState();
  await setState({ lastActivityAt: Date.now(), lastHeartbeatAt: Date.now(), siteUnlocks: {} });
  if (ready && state.lockOnStartup !== false) await lockBrowser('startup');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    let state = await getState();
    const unlockedOnly = new Set([
      'CHANGE_PASSWORD', 'UPDATE_SECURITY', 'UPDATE_THEME', 'UPDATE_ACCENT_COLOR', 'UPDATE_SITE_RULES', 'START_FOCUS', 'STOP_FOCUS',
      'SET_SITE_PASSWORD',
      'REMOVE_SITE_PASSWORD', 'REGENERATE_RECOVERY', 'CLEAR_LOGS',
      'EXPORT_CONFIG', 'IMPORT_CONFIG'
    ]);
    if (unlockedOnly.has(message?.type) && state.isLocked) {
      sendResponse({ ok: false, error: 'Hãy mở khóa Chrome trước khi thay đổi thiết lập.' });
      return;
    }

    if (message?.type === 'GET_LOCK_STATE' || message?.type === 'GET_SETTINGS') {
      state = await migrateLegacyState(state);
      sendResponse(sanitizedSettings(state));
      return;
    }
    if (message?.type === 'GET_PAGE_STATE') {
      sendResponse({ ...getPageAccess(sender.tab?.url || message.url || '', state), customGreeting: state.customGreeting });
      return;
    }
    if (message?.type === 'OPEN_UNLOCK') {
      const host = normalizeHost(message.host || pageHost(sender.tab?.url || ''));
      await openLockTab(host ? { host, reason: 'site' } : {});
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'SETUP_PASSWORD') {
      sendResponse(await setupPassword(message, state));
      return;
    }
    if (message?.type === 'UNLOCK_REQUEST') {
      sendResponse(await handleUnlock(message, state));
      return;
    }
    if (message?.type === 'LOCK_NOW') {
      sendResponse({ ok: await lockBrowser('manual') });
      return;
    }
    if (message?.type === 'CHANGE_PASSWORD') {
      sendResponse(await changePassword(message, state));
      return;
    }
    if (message?.type === 'UPDATE_SECURITY') {
      const patch = {
        autoLockMinutes: Math.max(0, Math.min(1440, Number(message.autoLockMinutes || 0))),
        lockOnStartup: message.lockOnStartup !== false,
        lockOnSystemLock: message.lockOnSystemLock !== false,
        customGreeting: String(message.customGreeting || '').trim().slice(0, 80) || 'Chào mừng trở lại'
      };
      await setState(patch);
      chrome.idle.setDetectionInterval(Math.max(60, patch.autoLockMinutes * 60 || 60));
      await addLog('SECURITY_SETTINGS');
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'UPDATE_THEME') {
      const theme = ['light', 'dark', 'system'].includes(message.theme) ? message.theme : 'system';
      await setState({ theme });
      sendResponse({ ok: true, theme });
      return;
    }
    if (message?.type === 'UPDATE_ACCENT_COLOR') {
      const accentColor = /^#[0-9a-f]{6}$/i.test(message.accentColor || '') ? message.accentColor.toLowerCase() : '#5753d9';
      await setState({ accentColor });
      sendResponse({ ok: true, accentColor });
      return;
    }
    if (message?.type === 'UPDATE_SITE_RULES') {
      const patch = {
        protectedSites: normalizeRules(message.protectedSites),
        allowedSites: normalizeRules(message.allowedSites),
        focusDomains: normalizeRules(message.focusDomains)
      };
      await setState(patch);
      await addLog('SITE_RULES_UPDATE');
      await broadcastPageStates();
      sendResponse({ ok: true, ...patch });
      return;
    }
    if (message?.type === 'START_FOCUS') {
      const minutes = Math.max(1, Math.min(1440, Number(message.minutes || 25)));
      const focusUntil = Date.now() + minutes * 60000;
      const focusDomains = normalizeRules(message.domains || state.focusDomains);
      await setState({ focusUntil, focusDomains });
      await addLog('FOCUS_START', `${minutes} phút`);
      await broadcastPageStates();
      sendResponse({ ok: true, focusUntil, focusDomains });
      return;
    }
    if (message?.type === 'STOP_FOCUS') {
      await setState({ focusUntil: 0 });
      await addLog('FOCUS_STOP');
      await broadcastPageStates();
      sendResponse({ ok: true });
      return;
    }
    if (['CREATE_PROFILE', 'SWITCH_PROFILE', 'DELETE_PROFILE', 'SET_PIN', 'REMOVE_PIN'].includes(message?.type)) {
      sendResponse({ ok: false, error: 'Phiên bản này chỉ hỗ trợ một profile Chrome.' });
      return;
    }
    if (message?.type === 'SET_SITE_PASSWORD' || message?.type === 'REMOVE_SITE_PASSWORD') {
      const active = getActiveProfile(state);
      if (!active || !(await verifyProfileSecret(active, message.password, 'password'))) {
        sendResponse({ ok: false, error: 'Mật khẩu chính không đúng.' });
        return;
      }
      if (message.type === 'SET_SITE_PASSWORD' && !String(message.sitePassword || '').length) {
        sendResponse({ ok: false, error: 'Mật khẩu website không được để trống.' });
        return;
      }
      const pinLength = Number(state.pinLength) === 6 ? 6 : 4;
      if (message.type === 'SET_SITE_PASSWORD' && !new RegExp(`^\\d{${pinLength}}$`).test(String(message.sitePassword || ''))) {
        sendResponse({ ok: false, error: `Mã PIN website phải gồm đúng ${pinLength} chữ số.` });
        return;
      }
      const updated = {
        ...active,
        siteCredential: message.type === 'SET_SITE_PASSWORD'
          ? await PLcrypto.createCredential(message.sitePassword)
          : null
      };
      await setState({
        profiles: state.profiles.map(item => item.id === active.id ? updated : item),
        siteUnlocks: {}
      });
      await addLog(message.type === 'SET_SITE_PASSWORD' ? 'SITE_PASSWORD_SET' : 'SITE_PASSWORD_REMOVE');
      await broadcastPageStates();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'REGENERATE_RECOVERY') {
      const active = getActiveProfile(state);
      if (!active || !(await verifyProfileSecret(active, message.password, 'password'))) return sendResponse({ ok: false, error: 'Mật khẩu hiện tại không đúng.' });
      const recoveryCode = PLcrypto.generateRecoveryCode();
      const updated = { ...active, recoveryCredential: await PLcrypto.createCredential(recoveryCode) };
      await setState({ profiles: state.profiles.map(item => item.id === active.id ? updated : item) });
      await addLog('RECOVERY_REGENERATE');
      sendResponse({ ok: true, recoveryCode });
      return;
    }
    if (message?.type === 'GET_LOGS') {
      sendResponse({ ok: true, logs: state.logs || [] });
      return;
    }
    if (message?.type === 'CLEAR_LOGS') {
      await setState({ logs: [] });
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'EXPORT_CONFIG') {
      sendResponse({ ok: true, config: {
        format: 'profile-lock-lite-config', version: 2, exportedAt: new Date().toISOString(),
        settings: { autoLockMinutes: state.autoLockMinutes, lockOnStartup: state.lockOnStartup, lockOnSystemLock: state.lockOnSystemLock, theme: state.theme, accentColor: state.accentColor, customGreeting: state.customGreeting, protectedSites: state.protectedSites, allowedSites: state.allowedSites, focusDomains: state.focusDomains }
      }});
      return;
    }
    if (message?.type === 'IMPORT_CONFIG') {
      const settings = message.config?.format === 'profile-lock-lite-config' ? message.config.settings : null;
      if (!settings) return sendResponse({ ok: false, error: 'Tệp cấu hình không hợp lệ.' });
      const patch = {
        autoLockMinutes: Math.max(0, Math.min(1440, Number(settings.autoLockMinutes || 0))),
        lockOnStartup: settings.lockOnStartup !== false,
        lockOnSystemLock: settings.lockOnSystemLock !== false,
        theme: ['light', 'dark', 'system'].includes(settings.theme) ? settings.theme : 'system',
        accentColor: /^#[0-9a-f]{6}$/i.test(settings.accentColor || '') ? settings.accentColor.toLowerCase() : '#5753d9',
        customGreeting: String(settings.customGreeting || '').trim().slice(0, 80) || 'Chào mừng trở lại',
        protectedSites: normalizeRules(settings.protectedSites), allowedSites: normalizeRules(settings.allowedSites), focusDomains: normalizeRules(settings.focusDomains)
      };
      await setState(patch);
      await addLog('CONFIG_IMPORT');
      await broadcastPageStates();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'USER_ACTIVITY') {
      if (!state.isLocked) await setState({ lastActivityAt: Date.now() });
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: 'Yêu cầu không được hỗ trợ.' });
  })().catch(error => {
    console.error(error);
    sendResponse({ ok: false, error: 'Extension gặp lỗi khi xử lý yêu cầu.' });
  });
  return true;
});

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(async newState => {
  const state = await getState();
  if (newState === 'locked' && state.lockOnSystemLock !== false) return lockBrowser('system-locked');
  if (newState === 'idle' && state.autoLockMinutes > 0 && !state.isLocked) {
    if (Date.now() - state.lastActivityAt >= state.autoLockMinutes * 60000) await lockBrowser('idle');
  }
  if (newState === 'active' && state.isLocked && getActiveProfile(state)) await openLockTab();
});

chrome.alarms.create('activityCheck', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'activityCheck') return;
  const state = await getState();
  const now = Date.now();
  if (!state.isLocked && state.lockOnSystemLock !== false && state.lastHeartbeatAt && now - state.lastHeartbeatAt > 150000) {
    await lockBrowser('resume-from-sleep');
  } else if (!state.isLocked && state.autoLockMinutes > 0 && now - state.lastActivityAt >= state.autoLockMinutes * 60000) {
    await lockBrowser('inactivity-timeout');
  }
  if (state.focusUntil && state.focusUntil <= now) {
    await setState({ focusUntil: 0 });
    await addLog('FOCUS_COMPLETE');
    await broadcastPageStates();
  }
  await setState({ lastHeartbeatAt: now });
});

chrome.tabs.onActivated.addListener(async info => {
  const tab = await chrome.tabs.get(info.tabId).catch(() => null);
  if (!tab) return;
  const state = await getState();
  const access = getPageAccess(tab.url || '', state);
  await sendPageState(tab);
  if (access.reason === 'global') await openLockTab();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'complete') return;
  const state = await getState();
  const access = getPageAccess(tab.url || changeInfo.url || '', state);
  await sendPageState(tab);
  if (access.reason === 'global') await openLockTab();
  await pruneSiteUnlocks();
});

chrome.tabs.onRemoved.addListener(async () => {
  await pruneSiteUnlocks();
});

chrome.windows.onFocusChanged.addListener(async windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const state = await getState();
  if (state.isLocked && getActiveProfile(state)) await openLockTab();
});

chrome.commands.onCommand.addListener(async command => {
  if (command === 'lock-now') await lockBrowser('keyboard-shortcut');
});

chrome.webNavigation.onCommitted.addListener(async details => {
  if (details.frameId !== 0 || details.tabId < 0) return;
  const tab = await chrome.tabs.get(details.tabId).catch(() => null);
  if (!tab) return;
  const state = await getState();
  const access = getPageAccess(details.url || tab.url || '', state);
  await sendPageState(tab);
  if (access.reason === 'global') await openLockTab();
});
