const $ = id => document.getElementById(id);
const lockNow = $('lockNow');
const openSettings = $('openSettings');
const message = $('message');
const statusCard = $('statusCard');
const statusTitle = $('statusTitle');
const statusText = $('statusText');
const siteCard = $('siteCard');
const siteHost = $('siteHost');
const siteStatus = $('siteStatus');
const toggleSiteProtection = $('toggleSiteProtection');
let state = null;
let currentHost = '';
let siteProtected = false;
let forceMove = false;
let timer = null;

function send(type, payload = {}) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type, ...payload }, response => {
    if (chrome.runtime.lastError) resolve({ ok: false, error: 'Không đọc được trạng thái extension.' });
    else resolve(response || {});
  }));
}

function normalizeTabHost(url) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.hostname.toLowerCase().replace(/^www\./, '') : '';
  } catch { return ''; }
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function applyAppearance() {
  const dark = state.theme === 'dark' || (state.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const accent = /^#[0-9a-f]{6}$/i.test(state.accentColor || '') ? state.accentColor : '#5753d9';
  const rgb = [1, 3, 5].map(index => parseInt(accent.slice(index, index + 2), 16));
  const soft = rgb.map(channel => Math.round(channel * (dark ? .22 : .11) + (dark ? 18 : 255) * (dark ? .78 : .89)));
  const interactive = PLTheme.getAccessibleInteractiveColor(accent, dark ? '#19191c' : '#ffffff');
  const root = document.documentElement.style;
  root.setProperty('--accent', accent); root.setProperty('--accent-interactive', interactive); root.setProperty('--accent-soft', `rgb(${soft.join(', ')})`);
  root.setProperty('--focus', `rgba(${rgb.join(', ')}, ${dark ? .28 : .16})`);
  root.setProperty('--accent-contrast', PLTheme.getAccessibleTextColor(interactive, '#18181b'));
}

function renderSite() {
  siteCard.hidden = !currentHost || state.needsSetup || state.isLocked;
  if (siteCard.hidden) return;
  siteProtected = (state.protectedSites || []).some(rule => currentHost === rule || currentHost.endsWith(`.${rule}`));
  siteHost.textContent = currentHost;
  siteStatus.textContent = siteProtected ? 'Luôn yêu cầu mã PIN' : 'Trang này chưa được bảo vệ';
  toggleSiteProtection.textContent = siteProtected ? 'Bỏ bảo vệ trang này' : 'Bảo vệ trang này';
  toggleSiteProtection.disabled = false;
}

function render() {
  clearInterval(timer); statusCard.className = 'status-card'; applyAppearance();
  if (state.needsSetup || state.onboardingComplete === false) {
    statusCard.classList.add('setup'); statusTitle.textContent = 'Chưa thiết lập'; statusText.textContent = 'Tạo mã PIN để bật bảo vệ.';
    lockNow.hidden = true; openSettings.textContent = 'Tạo mã PIN'; renderSite(); return;
  }
  lockNow.hidden = false; openSettings.textContent = 'Mở cài đặt';
  if (state.isLocked) {
    statusCard.classList.add('locked'); statusTitle.textContent = 'Đã khóa'; statusText.textContent = 'Cần nhập mã PIN để tiếp tục'; lockNow.disabled = true; renderSite(); return;
  }
  lockNow.disabled = false; statusTitle.textContent = 'Đang mở';
  const update = () => { statusText.textContent = state.autoLockAt ? `Tự động khóa sau ${formatTime(state.autoLockAt - Date.now())}` : 'Tự động khóa đang tắt'; };
  update(); timer = setInterval(update, 1000); renderSite();
}

toggleSiteProtection.addEventListener('click', async () => {
  if (toggleSiteProtection.disabled) return;
  toggleSiteProtection.disabled = true; toggleSiteProtection.textContent = 'Đang lưu…'; message.textContent = '';
  const response = await send('UPDATE_CURRENT_SITE', { host: currentHost, protect: !siteProtected, forceMove });
  if (response.conflict) {
    forceMove = true; toggleSiteProtection.disabled = false; toggleSiteProtection.textContent = 'Chuyển sang yêu cầu PIN'; message.textContent = response.error; return;
  }
  forceMove = false;
  if (!response.ok) { toggleSiteProtection.disabled = false; message.textContent = response.error || 'Không thể cập nhật website.'; return renderSite(); }
  state.protectedSites = response.protectedSites; state.allowedSites = response.allowedSites || state.allowedSites;
  message.textContent = response.protected ? 'Đã bảo vệ website này.' : 'Đã bỏ bảo vệ website này.'; renderSite();
});

lockNow.addEventListener('click', async () => {
  lockNow.disabled = true; lockNow.textContent = 'Đang khóa…';
  const response = await send('LOCK_NOW');
  if (response.ok) { message.textContent = 'Đã khóa Chrome.'; state.isLocked = true; render(); }
  else { lockNow.disabled = false; lockNow.textContent = 'Khóa Chrome ngay'; message.textContent = response.error || 'Không thể khóa.'; }
});
openSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());

Promise.all([send('GET_LOCK_STATE'), chrome.tabs.query({ active: true, currentWindow: true })]).then(([result, tabs]) => {
  state = result; currentHost = normalizeTabHost(tabs[0]?.url || ''); render();
});
