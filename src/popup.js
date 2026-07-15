const lockNow = document.getElementById('lockNow');
const openSettings = document.getElementById('openSettings');
const message = document.getElementById('message');
const statusCard = document.getElementById('statusCard');
const statusTitle = document.getElementById('statusTitle');
const statusText = document.getElementById('statusText');
let state = null;
let timer = null;

function send(type) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type }, response => {
    if (chrome.runtime.lastError) resolve({ error: 'Không đọc được trạng thái.' });
    else resolve(response || {});
  }));
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function applyAccent(color) {
  const accent = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#5753d9';
  const rgb = [1, 3, 5].map(index => parseInt(accent.slice(index, index + 2), 16));
  const dark = document.documentElement.dataset.theme === 'dark';
  const base = dark ? 18 : 255;
  const soft = rgb.map(channel => Math.round(channel * (dark ? .22 : .11) + base * (dark ? .78 : .89)));
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--accent-soft', `rgb(${soft.join(', ')})`);
  root.setProperty('--focus', `rgba(${rgb.join(', ')}, ${dark ? .28 : .16})`);
  root.setProperty('--accent-contrast', luminance > .62 ? '#18181b' : '#ffffff');
}

function render() {
  clearInterval(timer);
  statusCard.className = 'status-card';
  if (!state || state.error) {
    statusTitle.textContent = 'Không đọc được trạng thái';
    statusText.textContent = 'Hãy tải lại extension';
    return;
  }
  const dark = state.theme === 'dark' || (state.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  applyAccent(state.accentColor);
  if (state.needsSetup) {
    statusCard.classList.add('setup');
    statusTitle.textContent = 'Chưa thiết lập';
    statusText.textContent = 'Mở cài đặt để tạo mật khẩu';
    lockNow.disabled = true;
    return;
  }
  lockNow.disabled = false;
  if (state.isLocked) {
    statusCard.classList.add('locked');
    statusTitle.textContent = 'Chrome đang khóa';
    statusText.textContent = `Hồ sơ ${state.activeProfile?.name || 'Mặc định'}`;
    lockNow.disabled = true;
    return;
  }
  statusTitle.textContent = 'Đang được bảo vệ';
  const update = () => {
    statusText.textContent = state.autoLockAt
      ? `Tự khóa sau ${formatTime(state.autoLockAt - Date.now())}`
      : `Hồ sơ ${state.activeProfile?.name || 'Mặc định'}`;
  };
  update();
  timer = setInterval(update, 1000);
}

lockNow.addEventListener('click', async () => {
  lockNow.disabled = true;
  const response = await send('LOCK_NOW');
  if (response.ok) {
    message.textContent = 'Đã khóa Chrome.';
    setTimeout(() => window.close(), 350);
  } else {
    lockNow.disabled = false;
    message.textContent = response.error || 'Không thể khóa.';
  }
});
openSettings.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

send('GET_LOCK_STATE').then(result => { state = result; render(); });
