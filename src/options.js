const $ = id => document.getElementById(id);
const UI_VERSION = '2.0.2';
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
  importConfig: $('importConfig'), importFile: $('importFile'), resetSettings: $('resetSettings'), factoryResetPin: $('factoryResetPin'), factoryReset: $('factoryReset'), logList: $('logList'), clearLogs: $('clearLogs'),
  message: $('message'), toast: $('toast'), appShell: $('appShell'), onboarding: $('onboarding'),
  onboardingPin: $('onboardingPin'), onboardingPinConfirm: $('onboardingPinConfirm'), onboardingCreatePin: $('onboardingCreatePin'),
  onboardingRecoveryCode: $('onboardingRecoveryCode'), onboardingRecoverySaved: $('onboardingRecoverySaved'), onboardingRecoveryNext: $('onboardingRecoveryNext'),
  onboardingRecoveryResume: $('onboardingRecoveryResume'), onboardingRecoveryPin: $('onboardingRecoveryPin'), onboardingRegenerateRecovery: $('onboardingRegenerateRecovery'),
  onboardingCopyRecovery: $('onboardingCopyRecovery'), onboardingDownloadRecovery: $('onboardingDownloadRecovery'), onboardingCopyStatus: $('onboardingCopyStatus'),
  onboardingFinish: $('onboardingFinish'), onboardingAutolock: $('onboardingAutolock'), onboardingLockStartup: $('onboardingLockStartup'), onboardingLockSleep: $('onboardingLockSleep'),
  onboardingStepLabel: $('onboardingStepLabel'), onboardingProgress: $('onboardingProgress'), addCurrentSite: $('addCurrentSite'),
  summaryState: $('summaryState'), summaryTitle: $('summaryTitle'), summaryCountdown: $('summaryCountdown'), summaryStartup: $('summaryStartup'),
  summarySleep: $('summarySleep'), summarySites: $('summarySites'), summaryFocus: $('summaryFocus'), summaryLockNow: $('summaryLockNow')
};

let settings = null;
let needsSetup = true;
let changeMode = false;
let recoveryReset = false;
let countdownTimer = null;
let toastTimer = null;
let onboardingStep = 1;
let onboardingRecovery = sessionStorage.getItem('profileLockOnboardingRecovery') || '';

function showOnboardingStep(step) {
  onboardingStep = Math.max(1, Math.min(3, step));
  document.querySelectorAll('.onboarding-step').forEach((section, index) => { section.hidden = index + 1 !== onboardingStep; });
  els.onboardingStepLabel.textContent = `Bước ${onboardingStep}/3`;
  els.onboardingProgress.style.width = `${onboardingStep / 3 * 100}%`;
  if (onboardingStep === 2) {
    els.onboardingRecoveryCode.textContent = onboardingRecovery || 'Chưa tạo lại mã';
    els.onboardingRecoveryResume.hidden = !!onboardingRecovery;
    els.onboardingRecoverySaved.disabled = !onboardingRecovery;
  }
}

function onboardingPinLength() {
  return Number(document.querySelector('input[name="onboardingPinLength"]:checked')?.value) === 4 ? 4 : 6;
}

function validateOnboardingPin() {
  const length = onboardingPinLength();
  const validPin = els.onboardingPin.value.length === length;
  const matches = validPin && els.onboardingPin.value === els.onboardingPinConfirm.value;
  $('onboardingPinError').textContent = els.onboardingPin.value && !validPin ? `Mã PIN phải gồm đúng ${length} số.` : '';
  $('onboardingConfirmError').textContent = els.onboardingPinConfirm.value && !matches ? 'Mã PIN xác nhận chưa khớp.' : '';
  els.onboardingCreatePin.disabled = !matches;
}

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
  const page = dark ? '#19191c' : '#ffffff';
  const interactive = PLTheme.getAccessibleInteractiveColor(accent, page);
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--accent-interactive', interactive);
  root.setProperty('--accent-soft', `rgb(${soft.join(', ')})`);
  root.setProperty('--focus', `rgba(${red}, ${green}, ${blue}, ${dark ? .28 : .16})`);
  root.setProperty('--accent-contrast', PLTheme.getAccessibleTextColor(interactive, '#18181b'));
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
    : recoveryReset ? 'Mã khôi phục đã được xác nhận. Hãy đặt mã PIN mới trong 5 phút.'
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
      els.summaryState.textContent = 'Đã khóa';
      els.summaryTitle.textContent = 'Cần nhập mã PIN để tiếp tục';
      els.summaryCountdown.textContent = 'Phiên Chrome hiện không thể truy cập.';
    } else if (settings.autoLockAt) {
      els.autoLockCountdown.textContent = `Tự khóa sau ${formatRemaining(settings.autoLockAt - Date.now())}`;
      els.headerStatus.textContent = 'Đang mở';
      els.summaryState.textContent = 'Đang mở';
      els.summaryTitle.textContent = 'Bảo vệ đang hoạt động';
      els.summaryCountdown.textContent = `Tự động khóa sau ${formatRemaining(settings.autoLockAt - Date.now())}`;
    } else {
      els.autoLockCountdown.textContent = 'Tự động khóa đang tắt.';
      els.headerStatus.textContent = 'Đang mở';
      els.summaryState.textContent = 'Cần chú ý';
      els.summaryTitle.textContent = 'Tự động khóa đang tắt';
      els.summaryCountdown.textContent = 'Bạn vẫn có thể khóa ngay bất cứ lúc nào.';
    }
    if (settings.focusUntil > Date.now()) {
      els.focusStatus.textContent = `Đang tập trung · còn ${formatRemaining(settings.focusUntil - Date.now())}`;
      els.summaryFocus.textContent = formatRemaining(settings.focusUntil - Date.now());
      els.startFocus.disabled = true;
      els.stopFocus.disabled = false;
      $('focusCard').classList.add('running');
    } else {
      els.focusStatus.textContent = 'Chưa có phiên tập trung.';
      els.summaryFocus.textContent = 'Không chạy';
      els.startFocus.disabled = false;
      els.stopFocus.disabled = true;
      $('focusCard').classList.remove('running');
    }
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

async function loadLogs() {
  const response = await send('GET_LOGS');
  const labels = {
    LOCK: 'Đã khóa', UNLOCK: 'Đã mở khóa', RECOVERY_UNLOCK: 'Mở bằng mã khôi phục',
    FAILED_UNLOCK: 'Mở khóa thất bại', SITE_UNLOCK: 'Mở website bảo vệ', SETUP: 'Tạo mã PIN',
    PASSWORD_CHANGE: 'Đổi mã PIN', SECURITY_SETTINGS: 'Đổi thiết lập khóa', SITE_RULES_UPDATE: 'Cập nhật website',
    FOCUS_START: 'Bắt đầu tập trung', FOCUS_STOP: 'Dừng tập trung', FOCUS_COMPLETE: 'Hoàn thành tập trung',
    PROFILE_CREATE: 'Tạo hồ sơ', PROFILE_SWITCH: 'Chuyển hồ sơ', PROFILE_DELETE: 'Xóa hồ sơ',
    PIN_SET: 'Thiết lập PIN cũ', PIN_REMOVE: 'Xóa PIN cũ', SITE_PASSWORD_SET: 'Đặt mã PIN website',
    SITE_PASSWORD_REMOVE: 'Xóa mã PIN website', RECOVERY_REGENERATE: 'Tạo mã khôi phục', CONFIG_IMPORT: 'Nhập cấu hình', ONBOARDING_COMPLETE: 'Hoàn tất thiết lập'
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
  els.onboardingRecoveryPin.length = pinLength;
  els.factoryResetPin.length = pinLength;
  els.protectedSites.value = response.protectedSites;
  els.allowedSites.value = response.allowedSites;
  els.focusDomains.value = response.focusDomains;
  els.protectedSites.opposites = response.allowedSites;
  els.allowedSites.opposites = response.protectedSites;
  els.themeSelect.value = response.theme;
  els.accentColor.value = normalizeAccent(response.accentColor);
  applyTheme(response.theme, response.accentColor);
  els.sitePasswordStatus.textContent = response.activeProfile?.hasSitePassword
    ? 'Đang dùng mã PIN riêng cho các website bảo vệ.'
    : 'Chưa thiết lập — các website đang dùng mã PIN chính.';
  els.removeSitePassword.disabled = !response.activeProfile?.hasSitePassword;
  els.showChangePassword.hidden = needsSetup;
  setChangeMode(false);
  const onboardingRequired = needsSetup || response.onboardingComplete === false;
  els.onboarding.hidden = !onboardingRequired;
  els.appShell.hidden = onboardingRequired;
  if (onboardingRequired) {
    if (!needsSetup && onboardingRecovery) showOnboardingStep(2);
    else if (!needsSetup) showOnboardingStep(2);
    else showOnboardingStep(onboardingStep);
  }
  els.summaryStartup.textContent = response.lockOnStartup ? 'Bật' : 'Tắt';
  els.summarySleep.textContent = response.lockOnSystemLock ? 'Bật' : 'Tắt';
  els.summarySites.textContent = String(response.protectedSites.length);
  if (recoveryReset) {
    activatePanel('security');
    setChangeMode(true);
    els.showChangePassword.hidden = true;
    toast('Mã khôi phục hợp lệ. Hãy đặt mã PIN mới trong 5 phút.');
  }
  startCountdowns();
  await loadLogs();
}

els.newPassword.addEventListener('input', updateStrength);
els.confirmPassword.addEventListener('pin-complete', () => els.setupForm.requestSubmit());
els.sitePasswordConfirm.addEventListener('pin-complete', () => els.setSitePassword.click());
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
  toast(needsSetup ? 'Đã tạo mã PIN. Hãy lưu mã khôi phục.' : 'Đã đổi mã PIN và khóa lại.');
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
  const confirmed = await PLUI.confirmModal({ title: 'Xóa mã PIN website?', description: 'Các website bảo vệ sẽ dùng lại mã PIN chính.', confirmText: 'Xóa mã PIN website', destructive: true, trigger: els.removeSitePassword });
  if (!confirmed) return;
  const response = await send('REMOVE_SITE_PASSWORD', { password: els.siteMasterPassword.value });
  if (!response.ok) return toast(response.error, 'error');
  els.siteMasterPassword.value = els.sitePassword.value = els.sitePasswordConfirm.value = '';
  toast('Website bảo vệ sẽ dùng lại mã PIN chính.');
  await loadSettings();
});
els.startFocus.addEventListener('click', async () => {
  const preset = document.querySelector('input[name="focusPreset"]:checked')?.value || '25';
  const minutes = preset === 'custom' ? Number(els.focusMinutes.value) : Number(preset);
  const response = await send('START_FOCUS', { minutes, domains: els.focusDomains.value });
  if (!response.ok) return toast(response.error, 'error');
  toast('Đã bắt đầu phiên tập trung.');
  await loadSettings();
});
els.stopFocus.addEventListener('click', async () => {
  const confirmed = await PLUI.confirmModal({ title: 'Kết thúc phiên tập trung?', description: 'Các website bị chặn sẽ có thể truy cập lại ngay lập tức.', confirmText: 'Kết thúc phiên', destructive: true, trigger: els.stopFocus });
  if (!confirmed) return;
  const response = await send('STOP_FOCUS');
  if (!response.ok) return toast(response.error, 'error');
  toast('Đã kết thúc phiên tập trung.');
  await loadSettings();
});

els.generateRecovery.addEventListener('click', async () => {
  const confirmed = await PLUI.confirmModal({ title: 'Tạo mã khôi phục mới?', description: 'Mã khôi phục hiện tại sẽ không còn sử dụng được. Hãy chắc chắn rằng bạn có thể lưu mã mới ngay sau khi tạo.', confirmText: 'Tạo mã mới', destructive: true, trigger: els.generateRecovery });
  if (!confirmed) return;
  const response = await send('REGENERATE_RECOVERY', { password: els.recoveryPassword.value });
  els.recoveryPassword.value = '';
  if (!response.ok) {
    els.recoveryPassword.showError();
    return toast(response.error, 'error');
  }
  showRecovery(response.recoveryCode);
  toast('Mã khôi phục cũ đã bị vô hiệu hóa.');
});
els.copyRecovery.addEventListener('click', async () => {
  await navigator.clipboard.writeText(els.recoveryCode.textContent);
  toast('Đã sao chép mã khôi phục.');
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
    const imported = config?.settings || {};
    const confirmed = await PLUI.confirmModal({ title: 'Xem trước cấu hình nhập', description: `Cấu hình nhập vào sẽ thay đổi:\n- ${(imported.protectedSites || []).length} website yêu cầu PIN\n- ${(imported.allowedSites || []).length} website luôn được phép\n- Thời gian tự động khóa\n- Giao diện\n\nMã PIN hiện tại sẽ không bị thay đổi.`, confirmText: 'Áp dụng cấu hình', trigger: els.importConfig });
    if (!confirmed) return;
    const response = await send('IMPORT_CONFIG', { config });
    if (!response.ok) throw new Error(response.error);
    toast('Đã nhập cấu hình.');
    await loadSettings();
  } catch (error) {
    toast(error.message || 'Không đọc được tệp cấu hình.', 'error');
  } finally { els.importFile.value = ''; }
});
els.resetSettings.addEventListener('click', async () => {
  const confirmed = await PLUI.confirmModal({
    title: 'Khôi phục cài đặt mặc định?',
    description: 'Giao diện, tự động khóa, quy tắc website và Chế độ Tập trung sẽ trở về mặc định. Mã PIN chính, mã PIN website, mã khôi phục và nhật ký vẫn được giữ nguyên.',
    confirmText: 'Khôi phục mặc định',
    destructive: true,
    trigger: els.resetSettings
  });
  if (!confirmed) return;
  els.resetSettings.disabled = true;
  const response = await send('RESET_SETTINGS');
  els.resetSettings.disabled = false;
  if (!response.ok) return toast(response.error || 'Không thể khôi phục cài đặt mặc định.', 'error');
  toast('Đã khôi phục cài đặt mặc định.');
  await loadSettings();
});
els.factoryReset.addEventListener('click', async () => {
  if (els.factoryResetPin.value.length !== Number(settings?.pinLength || 4)) {
    els.factoryResetPin.showError();
    return toast('Nhập đủ mã PIN chính hiện tại để tiếp tục.', 'error');
  }
  const confirmed = await PLUI.confirmModal({
    title: 'Xóa mã PIN và thiết lập lại?',
    description: 'Toàn bộ mã PIN, mã khôi phục, quy tắc website, cấu hình và nhật ký sẽ bị xóa vĩnh viễn. Bạn sẽ phải tạo mã PIN và mã khôi phục mới.',
    confirmText: 'Xóa toàn bộ và thiết lập lại',
    destructive: true,
    trigger: els.factoryReset
  });
  if (!confirmed) return;
  els.factoryReset.disabled = true;
  const response = await send('FACTORY_RESET', { password: els.factoryResetPin.value });
  els.factoryReset.disabled = false;
  if (!response.ok) { els.factoryResetPin.showError(); return toast(response.error || 'Không thể thiết lập lại extension.', 'error'); }
  els.factoryResetPin.clear();
  sessionStorage.removeItem('profileLockOnboardingRecovery');
  onboardingRecovery = '';
  onboardingStep = 1;
  await loadSettings();
  toast('Đã xóa dữ liệu. Hãy tạo mã PIN mới.');
});
els.clearLogs.addEventListener('click', async () => {
  const confirmed = await PLUI.confirmModal({ title: 'Xóa toàn bộ nhật ký?', description: 'Các sự kiện bảo mật đã lưu trên thiết bị sẽ bị xóa và không thể khôi phục.', confirmText: 'Xóa nhật ký', destructive: true, trigger: els.clearLogs });
  if (!confirmed) return;
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
document.querySelectorAll('[data-go-panel]').forEach(button => button.addEventListener('click', () => activatePanel(button.dataset.goPanel)));
els.summaryLockNow.addEventListener('click', () => els.lockNow.click());
document.querySelectorAll('input[name="focusPreset"]').forEach(input => input.addEventListener('change', () => {
  $('customFocusField').hidden = document.querySelector('input[name="focusPreset"]:checked')?.value !== 'custom';
}));

document.querySelectorAll('input[name="onboardingPinLength"]').forEach(input => input.addEventListener('change', () => {
  const length = onboardingPinLength();
  els.onboardingPin.length = length; els.onboardingPinConfirm.length = length;
  els.onboardingPin.clear(); els.onboardingPinConfirm.clear(); validateOnboardingPin();
}));
els.onboardingPin.addEventListener('input', validateOnboardingPin);
els.onboardingPinConfirm.addEventListener('input', validateOnboardingPin);
els.onboardingCreatePin.addEventListener('click', async () => {
  if (onboardingRecovery) return showOnboardingStep(2);
  els.onboardingCreatePin.disabled = true;
  const response = await send('SETUP_PASSWORD', { password: els.onboardingPin.value, pinLength: onboardingPinLength(), onboarding: true });
  if (!response.ok) { els.onboardingPin.showError(); toast(response.error, 'error'); return validateOnboardingPin(); }
  onboardingRecovery = response.recoveryCode;
  sessionStorage.setItem('profileLockOnboardingRecovery', onboardingRecovery);
  showOnboardingStep(2);
});
els.onboardingRegenerateRecovery.addEventListener('click', async () => {
  if (els.onboardingRecoveryPin.value.length !== Number(settings?.pinLength || 4)) {
    els.onboardingRecoveryPin.showError();
    return toast('Nhập đủ mã PIN chính để tiếp tục.', 'error');
  }
  els.onboardingRegenerateRecovery.disabled = true;
  const response = await send('REGENERATE_RECOVERY', { password: els.onboardingRecoveryPin.value });
  els.onboardingRegenerateRecovery.disabled = false;
  if (!response.ok) { els.onboardingRecoveryPin.showError(); return toast(response.error, 'error'); }
  onboardingRecovery = response.recoveryCode;
  sessionStorage.setItem('profileLockOnboardingRecovery', onboardingRecovery);
  els.onboardingRecoveryPin.clear();
  showOnboardingStep(2);
});
els.onboardingCopyRecovery.addEventListener('click', async () => {
  if (!onboardingRecovery) return;
  await navigator.clipboard.writeText(onboardingRecovery); els.onboardingCopyStatus.textContent = 'Đã sao chép';
});
els.onboardingDownloadRecovery.addEventListener('click', () => {
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`${onboardingRecovery}\n`], { type: 'text/plain' })); link.download = 'chrome-profile-lock-recovery.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
els.onboardingRecoverySaved.addEventListener('change', () => { els.onboardingRecoveryNext.disabled = !els.onboardingRecoverySaved.checked; });
els.onboardingRecoveryNext.addEventListener('click', () => showOnboardingStep(3));
document.querySelectorAll('[data-onboarding-back]').forEach(button => button.addEventListener('click', () => showOnboardingStep(Number(button.dataset.onboardingBack))));
els.onboardingFinish.addEventListener('click', async () => {
  els.onboardingFinish.disabled = true;
  const response = await send('COMPLETE_ONBOARDING', { autoLockMinutes: Number(els.onboardingAutolock.value), lockOnStartup: els.onboardingLockStartup.checked, lockOnSystemLock: els.onboardingLockSleep.checked });
  if (!response.ok) { els.onboardingFinish.disabled = false; return toast(response.error, 'error'); }
  sessionStorage.removeItem('profileLockOnboardingRecovery'); onboardingRecovery = '';
  await loadSettings(); activatePanel('overview');
});

els.addCurrentSite.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const tab = tabs.find(item => /^https?:/i.test(item.url || ''));
  try { els.protectedSites.addRaw(PLUI.normalizeHostname(tab?.url || '')); }
  catch (error) { toast(error.message, 'error'); }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (els.themeSelect.value === 'system') applyTheme('system'); });

activatePanel(location.hash.slice(1) || 'overview', false);
loadSettings();
