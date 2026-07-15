const $ = id => document.getElementById(id);
const UI_VERSION = '2.2.0';
const els = {
  setupForm: $('setupForm'), oldPasswordField: $('oldPasswordField'), oldPassword: $('oldPassword'),
  newPassword: $('newPassword'), confirmPassword: $('confirmPassword'), setupText: $('setupText'),
  savePasswordBtn: $('savePasswordBtn'), showChangePassword: $('showChangePassword'), strengthBar: $('strengthBar'),
  strengthLabel: $('strengthLabel'), capsWarning: $('capsWarning'), autolock: $('autolock'),
  lockOnStartup: $('lockOnStartup'), lockOnSystemLock: $('lockOnSystemLock'), customGreeting: $('customGreeting'), saveSecurity: $('saveSecurity'),
  lockNow: $('lockNow'), autoLockCountdown: $('autoLockCountdown'), headerStatus: $('headerStatus'),
  protectedSites: $('protectedSites'), allowedSites: $('allowedSites'), focusDomains: $('focusDomains'),
  saveSites: $('saveSites'), siteMasterPassword: $('siteMasterPassword'), sitePassword: $('sitePassword'),
  sitePasswordConfirm: $('sitePasswordConfirm'), setSitePassword: $('setSitePassword'),
  removeSitePassword: $('removeSitePassword'), sitePasswordStatus: $('sitePasswordStatus'),
  focusMinutes: $('focusMinutes'), startFocus: $('startFocus'), stopFocus: $('stopFocus'),
  focusStatus: $('focusStatus'), recoveryPassword: $('recoveryPassword'),
  generateRecovery: $('generateRecovery'), recoveryOutput: $('recoveryOutput'), recoveryCode: $('recoveryCode'),
  copyRecovery: $('copyRecovery'), themeSelect: $('themeSelect'), accentColor: $('accentColor'),
  resetAccentColor: $('resetAccentColor'), exportConfig: $('exportConfig'),
  importConfig: $('importConfig'), importFile: $('importFile'), logList: $('logList'), clearLogs: $('clearLogs'),
  message: $('message'), toast: $('toast')
};

let settings = null;
let needsSetup = true;
let changeMode = false;
let recoveryReset = false;
let countdownTimer = null;
let toastTimer = null;

function activatePanel(name, updateHash = true) {
  const target = document.querySelector(`[data-panel-content="${name}"]`) || document.getElementById('panel-security');
  document.querySelectorAll('[data-panel-content]').forEach(panel => {
    const active = panel === target;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  document.querySelectorAll('[data-panel]').forEach(button => button.classList.toggle('active', button.dataset.panel === target.dataset.panelContent));
  if (updateHash) history.replaceState(null, '', `#${target.dataset.panelContent}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function send(type, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, ...payload }, response => {
      if (chrome.runtime.lastError) return resolve({ ok: false, error: 'Không kết nối được với extension. Hãy tải lại extension.' });
      resolve(response || { ok: false, error: 'Không nhận được phản hồi.' });
    });
  });
}

function toast(text, kind = 'success') {
  clearTimeout(toastTimer);
  els.toast.textContent = text;
  els.toast.className = `toast show${kind === 'error' ? ' error' : ''}`;
  toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 3200);
}

function normalizeAccent(color) {
  return /^#[0-9a-f]{6}$/i.test(color || '') ? color.toLowerCase() : '#5753d9';
}

function applyAccent(color) {
  const accent = normalizeAccent(color);
  const red = parseInt(accent.slice(1, 3), 16);
  const green = parseInt(accent.slice(3, 5), 16);
  const blue = parseInt(accent.slice(5, 7), 16);
  const dark = document.documentElement.dataset.theme === 'dark';
  const mix = dark ? 0.22 : 0.11;
  const base = dark ? 18 : 255;
  const soft = [red, green, blue].map(channel => Math.round(channel * mix + base * (1 - mix)));
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--accent-soft', `rgb(${soft.join(', ')})`);
  root.setProperty('--focus', `rgba(${red}, ${green}, ${blue}, ${dark ? .28 : .16})`);
  root.setProperty('--accent-contrast', luminance > .62 ? '#18181b' : '#ffffff');
}

function applyTheme(theme, accent = els.accentColor?.value) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  applyAccent(accent);
}

function passwordStrength(password) {
  if (!password) return { level: 0, label: '' };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { level: 1, label: 'Yếu' };
  if (score <= 2) return { level: 2, label: 'Trung bình' };
  if (score <= 3) return { level: 3, label: 'Khá' };
  return { level: 4, label: 'Mạnh' };
}

function updateStrength() {
  const length = selectedPinLength();
  const entered = els.newPassword.value.length;
  els.strengthBar.style.width = `${Math.min(100, entered / length * 100)}%`;
  els.strengthLabel.textContent = `${entered}/${length} số`;
}

function selectedPinLength() {
  return Number(document.querySelector('input[name="pinLength"]:checked')?.value) === 6 ? 6 : 4;
}

function applyPinLengths(currentLength, nextLength = currentLength) {
  els.oldPassword.length = currentLength;
  els.newPassword.length = nextLength;
  els.confirmPassword.length = nextLength;
  [els.siteMasterPassword, els.sitePassword, els.sitePasswordConfirm, els.recoveryPassword]
    .forEach(input => { input.length = currentLength; });
}

function setChangeMode(enabled) {
  changeMode = enabled;
  els.setupForm.hidden = !needsSetup && !enabled;
  els.oldPasswordField.hidden = !enabled || recoveryReset;
  els.oldPassword.required = enabled && !recoveryReset;
  els.showChangePassword.textContent = enabled ? 'Hủy đổi mã PIN' : 'Đổi mã PIN';
  els.savePasswordBtn.textContent = needsSetup ? 'Tạo mã PIN' : 'Lưu mã PIN mới';
  els.setupText.textContent = needsSetup
    ? 'Tạo mã PIN 4 hoặc 6 số cho lần dùng đầu tiên.'
    : recoveryReset ? 'Recovery code đã được xác nhận. Hãy đặt mã PIN mới trong 5 phút.'
      : enabled ? 'Nhập mã PIN hiện tại rồi chọn mã PIN mới.' : 'Mã PIN đang được bảo vệ bằng PBKDF2 với salt riêng.';
  if (!enabled) els.oldPassword.value = '';
}

function showRecovery(code) {
  activatePanel('identity');
  els.recoveryCode.textContent = code;
  els.recoveryOutput.hidden = false;
  els.recoveryOutput.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function formatRemaining(milliseconds) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function startCountdowns() {
  clearInterval(countdownTimer);
  const tick = () => {
    if (!settings) return;
    if (settings.isLocked) {
      els.autoLockCountdown.textContent = 'Chrome hiện đang khóa.';
      els.headerStatus.textContent = 'Đang khóa';
    } else if (settings.autoLockAt) {
      els.autoLockCountdown.textContent = `Tự khóa sau ${formatRemaining(settings.autoLockAt - Date.now())}`;
      els.headerStatus.textContent = 'Đang được bảo vệ';
    } else {
      els.autoLockCountdown.textContent = 'Tự động khóa đang tắt.';
      els.headerStatus.textContent = 'Đang được bảo vệ';
    }
    if (settings.focusUntil > Date.now()) {
      els.focusStatus.textContent = `Đang tập trung · còn ${formatRemaining(settings.focusUntil - Date.now())}`;
      els.startFocus.disabled = true;
      els.stopFocus.disabled = false;
    } else {
      els.focusStatus.textContent = 'Chưa có phiên tập trung.';
      els.startFocus.disabled = false;
      els.stopFocus.disabled = true;
    }
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

async function loadLogs() {
  const response = await send('GET_LOGS');
  const labels = {
    LOCK: 'Đã khóa', UNLOCK: 'Đã mở khóa', RECOVERY_UNLOCK: 'Mở bằng recovery code',
    FAILED_UNLOCK: 'Mở khóa thất bại', SITE_UNLOCK: 'Mở website bảo vệ', SETUP: 'Thiết lập mật khẩu',
    PASSWORD_CHANGE: 'Đổi mật khẩu', SECURITY_SETTINGS: 'Đổi thiết lập khóa', SITE_RULES_UPDATE: 'Cập nhật website',
    FOCUS_START: 'Bắt đầu tập trung', FOCUS_STOP: 'Dừng tập trung', FOCUS_COMPLETE: 'Hoàn thành tập trung',
    PROFILE_CREATE: 'Tạo hồ sơ', PROFILE_SWITCH: 'Chuyển hồ sơ', PROFILE_DELETE: 'Xóa hồ sơ',
    PIN_SET: 'Thiết lập PIN', PIN_REMOVE: 'Xóa PIN', SITE_PASSWORD_SET: 'Đặt mật khẩu website',
    SITE_PASSWORD_REMOVE: 'Xóa mật khẩu website', RECOVERY_REGENERATE: 'Tạo recovery code', CONFIG_IMPORT: 'Nhập cấu hình'
  };
  if (!response.ok || !response.logs?.length) {
    els.logList.innerHTML = '<p class="empty-state">Chưa có sự kiện.</p>';
    return;
  }
  const rows = response.logs.slice(0, 30).map(log => {
    const row = document.createElement('div');
    row.className = 'log-row';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = labels[log.action] || log.action;
    const detail = document.createElement('span');
    detail.textContent = [log.profile, log.details].filter(Boolean).join(' · ');
    copy.append(title, detail);
    const time = document.createElement('time');
    time.textContent = new Date(log.at).toLocaleString('vi-VN');
    row.append(copy, time);
    return row;
  });
  els.logList.replaceChildren(...rows);
}

async function loadSettings() {
  const response = await send('GET_SETTINGS');
  if (response.error) return toast(response.error, 'error');
  settings = response;
  if (response.extensionVersion !== UI_VERSION) {
    toast(`Service worker vẫn là bản ${response.extensionVersion || 'cũ'}. Hãy Reload extension để dùng v${UI_VERSION}.`, 'error');
  }
  needsSetup = response.needsSetup;
  recoveryReset = !!response.canResetWithRecovery;
  els.autolock.value = ['0', '1', '5', '15', '30'].includes(String(response.autoLockMinutes)) ? String(response.autoLockMinutes) : '15';
  els.lockOnStartup.checked = response.lockOnStartup;
  els.lockOnSystemLock.checked = response.lockOnSystemLock;
  els.customGreeting.value = response.customGreeting || '';
  const pinLength = Number(response.pinLength) === 6 ? 6 : 4;
  const lengthRadio = document.querySelector(`input[name="pinLength"][value="${pinLength}"]`);
  if (lengthRadio) lengthRadio.checked = true;
  applyPinLengths(pinLength);
  els.protectedSites.value = response.protectedSites.join('\n');
  els.allowedSites.value = response.allowedSites.join('\n');
  els.focusDomains.value = response.focusDomains.join('\n');
  els.themeSelect.value = response.theme;
  els.accentColor.value = normalizeAccent(response.accentColor);
  applyTheme(response.theme, response.accentColor);
  els.sitePasswordStatus.textContent = response.activeProfile?.hasSitePassword
    ? 'Đang dùng mã PIN riêng cho các website bảo vệ.'
    : 'Chưa thiết lập — các website đang dùng mã PIN chính.';
  els.removeSitePassword.disabled = !response.activeProfile?.hasSitePassword;
  els.showChangePassword.hidden = needsSetup;
  setChangeMode(false);
  if (needsSetup) activatePanel('security');
  if (recoveryReset) {
    activatePanel('security');
    setChangeMode(true);
    els.showChangePassword.hidden = true;
    toast('Recovery code hợp lệ. Hãy đặt mật khẩu mới trong 5 phút.');
  }
  startCountdowns();
  await loadLogs();
}

els.newPassword.addEventListener('input', updateStrength);
els.confirmPassword.addEventListener('pin-complete', () => els.setupForm.requestSubmit());
els.sitePasswordConfirm.addEventListener('pin-complete', () => els.setSitePassword.click());
els.recoveryPassword.addEventListener('pin-complete', () => els.generateRecovery.click());
els.setupForm.addEventListener('submit', async event => {
  event.preventDefault();
  const password = els.newPassword.value;
  if (password.length !== selectedPinLength()) return toast(`Mã PIN phải gồm đúng ${selectedPinLength()} chữ số.`, 'error');
  if (password !== els.confirmPassword.value) {
    els.confirmPassword.showError();
    return toast('Mã PIN xác nhận không khớp.', 'error');
  }
  els.savePasswordBtn.disabled = true;
  const response = needsSetup
    ? await send('SETUP_PASSWORD', { password, pinLength: selectedPinLength() })
    : await send('CHANGE_PASSWORD', { oldPassword: els.oldPassword.value, newPassword: password, pinLength: selectedPinLength() });
  els.savePasswordBtn.disabled = false;
  if (!response.ok) {
    (needsSetup ? els.newPassword : els.oldPassword).showError();
    return toast(response.error, 'error');
  }
  els.oldPassword.value = els.newPassword.value = els.confirmPassword.value = '';
  updateStrength();
  if (response.recoveryCode) showRecovery(response.recoveryCode);
  recoveryReset = false;
  toast(needsSetup ? 'Đã tạo mã PIN. Hãy lưu recovery code.' : 'Đã đổi mã PIN và khóa lại.');
  await loadSettings();
});
els.showChangePassword.addEventListener('click', () => setChangeMode(!changeMode));

els.saveSecurity.addEventListener('click', async () => {
  const response = await send('UPDATE_SECURITY', { autoLockMinutes: Number(els.autolock.value), lockOnStartup: els.lockOnStartup.checked, lockOnSystemLock: els.lockOnSystemLock.checked, customGreeting: els.customGreeting.value });
  if (!response.ok) return toast(response.error, 'error');
  toast('Đã lưu thiết lập tự động khóa.');
  await loadSettings();
});
els.lockNow.addEventListener('click', async () => {
  const response = await send('LOCK_NOW');
  response.ok ? toast('Đã khóa Chrome.') : toast(response.error || 'Không thể khóa.', 'error');
});
els.saveSites.addEventListener('click', async () => {
  const response = await send('UPDATE_SITE_RULES', { protectedSites: els.protectedSites.value, allowedSites: els.allowedSites.value, focusDomains: els.focusDomains.value });
  if (!response.ok) return toast(response.error, 'error');
  toast('Đã lưu quy tắc website.');
  await loadSettings();
});
els.setSitePassword.addEventListener('click', async () => {
  if (els.sitePassword.value.length !== Number(settings.pinLength)) return toast(`Mã PIN website phải gồm đúng ${settings.pinLength} chữ số.`, 'error');
  if (els.sitePassword.value !== els.sitePasswordConfirm.value) {
    els.sitePasswordConfirm.showError();
    return toast('Mã PIN website nhập lại không khớp.', 'error');
  }
  const response = await send('SET_SITE_PASSWORD', {
    password: els.siteMasterPassword.value,
    sitePassword: els.sitePassword.value
  });
  if (!response.ok) {
    const error = response.error === 'Yêu cầu không được hỗ trợ.'
      ? 'Service worker vẫn đang chạy bản cũ. Hãy Reload extension tại chrome://extensions.'
      : response.error;
    els.siteMasterPassword.showError();
    return toast(error, 'error');
  }
  els.siteMasterPassword.value = els.sitePassword.value = els.sitePasswordConfirm.value = '';
  toast('Đã lưu mã PIN riêng cho website.');
  await loadSettings();
});
els.removeSitePassword.addEventListener('click', async () => {
  const response = await send('REMOVE_SITE_PASSWORD', { password: els.siteMasterPassword.value });
  if (!response.ok) return toast(response.error, 'error');
  els.siteMasterPassword.value = els.sitePassword.value = els.sitePasswordConfirm.value = '';
  toast('Website bảo vệ sẽ dùng lại mã PIN chính.');
  await loadSettings();
});
els.startFocus.addEventListener('click', async () => {
  const response = await send('START_FOCUS', { minutes: Number(els.focusMinutes.value), domains: els.focusDomains.value });
  if (!response.ok) return toast(response.error, 'error');
  toast('Đã bắt đầu phiên tập trung.');
  await loadSettings();
});
els.stopFocus.addEventListener('click', async () => {
  const response = await send('STOP_FOCUS');
  if (!response.ok) return toast(response.error, 'error');
  toast('Đã kết thúc phiên tập trung.');
  await loadSettings();
});

els.generateRecovery.addEventListener('click', async () => {
  const response = await send('REGENERATE_RECOVERY', { password: els.recoveryPassword.value });
  els.recoveryPassword.value = '';
  if (!response.ok) {
    els.recoveryPassword.showError();
    return toast(response.error, 'error');
  }
  showRecovery(response.recoveryCode);
  toast('Recovery code cũ đã bị vô hiệu hóa.');
});
els.copyRecovery.addEventListener('click', async () => {
  await navigator.clipboard.writeText(els.recoveryCode.textContent);
  toast('Đã sao chép recovery code.');
});

els.themeSelect.addEventListener('change', async () => {
  applyTheme(els.themeSelect.value);
  await send('UPDATE_THEME', { theme: els.themeSelect.value });
});
els.accentColor.addEventListener('input', () => applyAccent(els.accentColor.value));
els.accentColor.addEventListener('change', async () => {
  const response = await send('UPDATE_ACCENT_COLOR', { accentColor: els.accentColor.value });
  if (!response.ok) return toast(response.error || 'Không thể lưu màu giao diện.', 'error');
  toast('Đã đổi màu giao diện.');
});
els.resetAccentColor.addEventListener('click', async () => {
  els.accentColor.value = '#5753d9';
  applyAccent(els.accentColor.value);
  const response = await send('UPDATE_ACCENT_COLOR', { accentColor: els.accentColor.value });
  if (!response.ok) return toast(response.error || 'Không thể khôi phục màu mặc định.', 'error');
  toast('Đã khôi phục màu mặc định.');
});
els.exportConfig.addEventListener('click', async () => {
  const response = await send('EXPORT_CONFIG');
  if (!response.ok) return toast(response.error, 'error');
  const blob = new Blob([JSON.stringify(response.config, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `profile-lock-config-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('Đã xuất cấu hình không chứa thông tin bí mật.');
});
els.importConfig.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', async () => {
  if (!els.importFile.files?.[0]) return;
  try {
    const config = JSON.parse(await els.importFile.files[0].text());
    const response = await send('IMPORT_CONFIG', { config });
    if (!response.ok) throw new Error(response.error);
    toast('Đã nhập cấu hình.');
    await loadSettings();
  } catch (error) {
    toast(error.message || 'Không đọc được tệp cấu hình.', 'error');
  } finally { els.importFile.value = ''; }
});
els.clearLogs.addEventListener('click', async () => {
  if (!confirm('Xóa toàn bộ nhật ký bảo mật?')) return;
  await send('CLEAR_LOGS');
  await loadLogs();
  toast('Đã xóa nhật ký.');
});

document.querySelectorAll('input[name="pinLength"]').forEach(radio => radio.addEventListener('change', () => {
  const currentLength = Number(settings?.pinLength) === 6 ? 6 : 4;
  applyPinLengths(currentLength, selectedPinLength());
  if (!needsSetup && selectedPinLength() !== currentLength) {
    setChangeMode(true);
    els.newPassword.clear();
    els.confirmPassword.clear();
    toast('Hãy xác nhận mã PIN hiện tại và đặt mã PIN mới theo độ dài đã chọn.');
  }
}));
document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => activatePanel(button.dataset.panel)));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (els.themeSelect.value === 'system') applyTheme('system'); });

activatePanel(location.hash.slice(1) || 'security', false);
loadSettings();
