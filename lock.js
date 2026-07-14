const form = document.getElementById('unlockForm');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submitBtn');
const message = document.getElementById('message');
const subtitle = document.getElementById('subtitle');
const attemptsInfo = document.getElementById('attemptsInfo');
const inputLabel = document.getElementById('inputLabel');
const pinTab = document.getElementById('pinTab');
const revealPassword = document.getElementById('revealPassword');
const capsWarning = document.getElementById('capsWarning');
const unlockTabs = document.getElementById('unlockTabs');

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
  message.style.color = isError ? '#b42318' : '#158467';
  message.textContent = text;
}

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function setMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll('[data-mode]').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
  const config = {
    password: { label: 'Mật khẩu', placeholder: 'Nhập mật khẩu của bạn', autocomplete: 'current-password', type: 'password' },
    pin: { label: 'Mã PIN', placeholder: 'Nhập PIN 4–8 chữ số', autocomplete: 'one-time-code', type: 'password' },
    recovery: { label: 'Recovery code', placeholder: 'PL-XXXX-XXXX-XXXX-XXXX-XXXX', autocomplete: 'off', type: 'text' }
  }[mode];
  inputLabel.textContent = config.label;
  passwordInput.placeholder = config.placeholder;
  passwordInput.autocomplete = config.autocomplete;
  passwordInput.type = config.type;
  passwordInput.inputMode = mode === 'pin' ? 'numeric' : 'text';
  revealPassword.hidden = mode === 'recovery';
  revealPassword.textContent = 'Hiện';
  passwordInput.value = '';
  showMessage('');
  attemptsInfo.textContent = '';
  passwordInput.focus();
}

function startLockoutCountdown(seconds) {
  clearInterval(lockoutTimer);
  submitBtn.disabled = true;
  passwordInput.disabled = true;
  let remaining = Math.max(1, Number(seconds));
  const tick = () => {
    submitBtn.textContent = `Thử lại sau ${remaining}s`;
    showMessage(`Quá nhiều lần sai. Vui lòng chờ ${remaining} giây.`);
    remaining--;
    if (remaining < 0) {
      clearInterval(lockoutTimer);
      submitBtn.disabled = false;
      passwordInput.disabled = false;
      submitBtn.textContent = 'Mở khóa';
      showMessage('');
      attemptsInfo.textContent = '';
      passwordInput.focus();
    }
  };
  tick();
  lockoutTimer = setInterval(tick, 1000);
}

async function loadState() {
  state = await send('GET_LOCK_STATE');
  if (state.error) return showMessage(state.error);
  applyTheme(state.theme || 'system');
  pinTab.hidden = !state.activeProfile?.hasPin;
  if (!state.activeProfile?.hasPin && mode === 'pin') setMode('password');
  if (state.needsSetup) {
    subtitle.textContent = 'Bạn cần tạo mật khẩu trong phần cài đặt extension.';
    submitBtn.disabled = true;
    return;
  }
  if (state.unlockContext?.reason === 'site') {
    unlockTabs.hidden = true;
    setMode('password');
    inputLabel.textContent = state.activeProfile?.hasSitePassword ? 'Mật khẩu website' : 'Mật khẩu chính';
    passwordInput.placeholder = state.activeProfile?.hasSitePassword ? 'Nhập mật khẩu riêng của website' : 'Nhập mật khẩu chính';
    subtitle.textContent = `Xác thực để mở ${state.unlockContext.host}.`;
  } else {
    unlockTabs.hidden = false;
    subtitle.textContent = `Hồ sơ “${state.activeProfile?.name || 'Mặc định'}” đang được bảo vệ.`;
  }
  if (state.lockoutUntil > Date.now()) startLockoutCountdown(Math.ceil((state.lockoutUntil - Date.now()) / 1000));
  else if (state.failedAttempts > 0) attemptsInfo.textContent = `Đã nhập sai ${state.failedAttempts} lần.`;
}

document.querySelectorAll('[data-mode]').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
revealPassword.addEventListener('click', () => {
  passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
  revealPassword.textContent = passwordInput.type === 'password' ? 'Hiện' : 'Ẩn';
});
passwordInput.addEventListener('keyup', event => { capsWarning.hidden = mode === 'recovery' || !event.getModifierState('CapsLock'); });
passwordInput.addEventListener('blur', () => { capsWarning.hidden = true; });

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitBtn.disabled || !passwordInput.value) return;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang xác thực…';
  const secret = mode === 'password' ? passwordInput.value : passwordInput.value.trim();
  const response = await send('UNLOCK_REQUEST', { secret, mode });
  if (response.ok) {
    showMessage(response.recovered ? 'Đã xác nhận recovery code. Đang mở trang đặt lại mật khẩu…' : 'Đã mở khóa.', false);
    if (response.recovered) await chrome.runtime.openOptionsPage();
    setTimeout(() => window.close(), 450);
    return;
  }
  submitBtn.disabled = false;
  submitBtn.textContent = 'Mở khóa';
  passwordInput.value = '';
  showMessage(response.error || 'Không thể mở khóa.');
  if (response.lockedOut) startLockoutCountdown(response.secsLeft);
  else {
    attemptsInfo.textContent = response.failedAttempts ? `Đã nhập sai ${response.failedAttempts} lần.` : '';
    passwordInput.focus();
  }
});

setMode('password');
loadState();
