const form = document.getElementById('unlockForm');
const passwordInput = document.getElementById('password');
const recoveryInput = document.getElementById('recoveryInput');
const submitBtn = document.getElementById('submitBtn');
const message = document.getElementById('message');
const subtitle = document.getElementById('subtitle');
const attemptsInfo = document.getElementById('attemptsInfo');
const inputLabel = document.getElementById('inputLabel');
const capsWarning = document.getElementById('capsWarning');
const unlockTabs = document.getElementById('unlockTabs');
const greeting = document.getElementById('greeting');

let mode = 'password';
let lockoutTimer = null;
let state = null;

function send(type, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, ...payload }, response => {
      if (chrome.runtime.lastError) return resolve({ ok: false, error: 'Không kết nối được với extension.' });
      resolve(response || { ok: false, error: 'Không nhận được phản hồi.' });
    });
  });
}

function showMessage(text, isError = true) {
  message.textContent = text;
  message.dataset.kind = isError ? 'error' : 'success';
}

function applyTheme(theme, color) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const accent = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#5753d9';
  const rgb = [1, 3, 5].map(index => parseInt(accent.slice(index, index + 2), 16));
  const base = dark ? 18 : 255;
  const soft = rgb.map(channel => Math.round(channel * (dark ? .22 : .11) + base * (dark ? .78 : .89)));
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--accent-soft', `rgb(${soft.join(', ')})`);
  root.setProperty('--focus', `rgba(${rgb.join(', ')}, ${dark ? .28 : .16})`);
  root.setProperty('--accent-contrast', luminance > .62 ? '#18181b' : '#ffffff');
}

function setMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll('[data-mode]').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
  inputLabel.textContent = mode === 'recovery' ? 'Recovery code' : 'Mã PIN';
  passwordInput.hidden = mode === 'recovery';
  recoveryInput.hidden = mode !== 'recovery';
  passwordInput.value = '';
  recoveryInput.value = '';
  showMessage('');
  attemptsInfo.textContent = '';
  (mode === 'recovery' ? recoveryInput : passwordInput).focus();
}

function startLockoutCountdown(seconds) {
  clearInterval(lockoutTimer);
  submitBtn.disabled = true;
  passwordInput.disabled = true;
  recoveryInput.disabled = true;
  let remaining = Math.max(1, Number(seconds));
  const tick = () => {
    submitBtn.textContent = `Thử lại sau ${remaining}s`;
    showMessage(`Quá nhiều lần sai. Vui lòng chờ ${remaining} giây.`);
    remaining--;
    if (remaining < 0) {
      clearInterval(lockoutTimer);
      submitBtn.disabled = false;
      passwordInput.disabled = false;
      recoveryInput.disabled = false;
      submitBtn.textContent = 'Mở khóa';
      showMessage('');
      attemptsInfo.textContent = '';
      (mode === 'recovery' ? recoveryInput : passwordInput).focus();
    }
  };
  tick();
  lockoutTimer = setInterval(tick, 1000);
}

async function loadState() {
  state = await send('GET_LOCK_STATE');
  if (state.error) return showMessage(state.error);
  applyTheme(state.theme || 'system', state.accentColor);
  passwordInput.length = state.pinLength;
  greeting.textContent = state.customGreeting || 'Chào mừng trở lại';
  if (state.needsSetup) {
    subtitle.textContent = 'Bạn cần tạo mã PIN trong phần cài đặt extension.';
    submitBtn.disabled = true;
    return;
  }
  if (state.unlockContext?.reason === 'site') {
    unlockTabs.hidden = true;
    setMode('password');
    inputLabel.textContent = state.activeProfile?.hasSitePassword ? 'Mã PIN website' : 'Mã PIN chính';
    subtitle.textContent = `Xác thực để mở ${state.unlockContext.host}.`;
  } else {
    unlockTabs.hidden = false;
    subtitle.textContent = 'Profile Chrome này đang được bảo vệ.';
  }
  if (state.lockoutUntil > Date.now()) startLockoutCountdown(Math.ceil((state.lockoutUntil - Date.now()) / 1000));
  else if (state.failedAttempts > 0) attemptsInfo.textContent = `Đã nhập sai ${state.failedAttempts} lần.`;
}

document.querySelectorAll('[data-mode]').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
recoveryInput.addEventListener('keyup', event => { capsWarning.hidden = !event.getModifierState('CapsLock'); });
recoveryInput.addEventListener('blur', () => { capsWarning.hidden = true; });

form.addEventListener('submit', async event => {
  event.preventDefault();
  const input = mode === 'recovery' ? recoveryInput : passwordInput;
  if (submitBtn.disabled || !input.value) return;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang xác thực…';
  const secret = mode === 'recovery' ? recoveryInput.value.trim() : passwordInput.value;
  const response = await send('UNLOCK_REQUEST', { secret, mode });
  if (response.ok) {
    showMessage(response.recovered ? 'Đã xác nhận recovery code. Đang mở trang đặt lại mật khẩu…' : 'Đã mở khóa.', false);
    if (response.recovered) await chrome.runtime.openOptionsPage();
    setTimeout(() => window.close(), 450);
    return;
  }
  submitBtn.disabled = false;
  submitBtn.textContent = 'Mở khóa';
  recoveryInput.value = '';
  if (mode !== 'recovery') passwordInput.showError();
  showMessage(response.error || 'Không thể mở khóa.');
  if (response.lockedOut) startLockoutCountdown(response.secsLeft);
  else {
    attemptsInfo.textContent = response.failedAttempts ? `Đã nhập sai ${response.failedAttempts} lần.` : '';
    input.focus();
  }
});

passwordInput.addEventListener('pin-complete', () => {
  if (!submitBtn.disabled && mode === 'password') form.requestSubmit();
});

setMode('password');
loadState();
