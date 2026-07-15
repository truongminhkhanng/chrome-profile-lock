(() => {
  if (window.top !== window) return;

  const startupCurtain = document.createElement('style');
  startupCurtain.textContent = 'html{visibility:hidden!important;background:#11182a!important}';
  const rootReady = new Promise(resolve => {
    if (document.documentElement) {
      document.documentElement.appendChild(startupCurtain);
      resolve(document.documentElement);
      return;
    }
    const observer = new MutationObserver(() => {
      if (!document.documentElement) return;
      observer.disconnect();
      document.documentElement.appendChild(startupCurtain);
      resolve(document.documentElement);
    });
    observer.observe(document, { childList: true });
  });

  let blocked = false;
  let currentState = null;
  let host = null;
  let shadow = null;
  let mediaObserver = null;
  let countdownTimer = null;
  let watchdogTimer = null;
  let originalOverflow = '';
  const pausedMedia = new WeakSet();

  function safeSendMessage(payload, callback = () => {}) {
    try {
      chrome.runtime.sendMessage(payload, response => {
        const error = chrome.runtime.lastError;
        callback(response, error);
      });
    } catch (error) {
      startupCurtain.remove();
      callback(null, error);
    }
  }

  const blockedEvents = [
    'click', 'dblclick', 'mousedown', 'mouseup', 'keydown', 'keyup', 'keypress',
    'touchstart', 'touchend', 'touchmove', 'pointerdown', 'pointerup', 'pointermove',
    'wheel', 'scroll', 'contextmenu', 'dragstart', 'drag', 'drop', 'input', 'change',
    'submit', 'focus', 'focusin', 'focusout'
  ];

  function trap(event) {
    if (!blocked) return;
    if (host && event.composedPath?.().includes(host)) return;
    event.stopImmediatePropagation();
    event.preventDefault();
  }

  blockedEvents.forEach(name => {
    window.addEventListener(name, trap, { capture: true, passive: false });
    document.addEventListener(name, trap, { capture: true, passive: false });
  });

  function pauseMedia() {
    document.querySelectorAll('video,audio').forEach(item => {
      if (!item.paused) {
        item.pause();
        pausedMedia.add(item);
      }
    });
  }

  function resumeMedia() {
    document.querySelectorAll('video,audio').forEach(item => {
      if (pausedMedia.has(item)) item.play().catch(() => {});
    });
  }

  function copyFor(state) {
    if (state.reason === 'focus') return {
      kicker: 'CHẾ ĐỘ TẬP TRUNG',
      title: 'Website đang tạm khóa',
      text: 'Hãy quay lại công việc quan trọng. Trang này sẽ mở khi phiên tập trung kết thúc.',
      button: ''
    };
    if (state.reason === 'site') return {
      kicker: 'WEBSITE ĐƯỢC BẢO VỆ',
      title: 'Cần xác thực để truy cập',
      text: `Nhập mã PIN website để mở ${state.host || 'website này'}. Website sẽ khóa lại khi đóng tab cuối cùng, khóa màn hình hoặc sau 30 phút.`,
      button: 'Xác thực ngay'
    };
    return {
      kicker: 'PROFILE LOCK LITE',
      title: state.customGreeting || 'Phiên Chrome đang khóa',
      text: 'Chuyển sang màn hình mở khóa để tiếp tục phiên làm việc.',
      button: 'Mở màn hình khóa'
    };
  }

  function updateCountdown(root, state) {
    clearInterval(countdownTimer);
    const output = root.querySelector('.countdown');
    if (state.reason !== 'focus' || !state.focusUntil) {
      output.hidden = true;
      return;
    }
    output.hidden = false;
    const tick = () => {
      const left = Math.max(0, state.focusUntil - Date.now());
      const minutes = Math.floor(left / 60000);
      const seconds = Math.floor((left % 60000) / 1000);
      output.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      if (!left) {
        clearInterval(countdownTimer);
        requestState();
      }
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function mountOverlay(state) {
    const copy = copyFor(state);
    if (!host) {
      host = document.createElement('div');
      host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important;display:block!important;contain:strict!important;pointer-events:all!important;visibility:visible!important';
      shadow = host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = `
        <style>
          *{box-sizing:border-box}.screen{position:fixed;inset:0;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#101728,#202b49);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;user-select:none}.screen:before{position:absolute;inset:0;opacity:.14;background-image:linear-gradient(rgba(255,255,255,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.1) 1px,transparent 1px);background-size:48px 48px;content:""}.card{position:relative;width:min(92vw,440px);padding:34px;border:1px solid rgba(255,255,255,.55);border-radius:22px;background:rgba(255,255,255,.96);box-shadow:0 28px 70px rgba(0,0,0,.3);text-align:center}.mark{display:grid;width:58px;height:58px;margin:0 auto 22px;place-items:center;border-radius:18px;color:#fff;background:linear-gradient(145deg,#7171e8,#5151c7);box-shadow:0 12px 25px rgba(81,81,199,.25)}.lock{position:relative;width:20px;height:16px;border:2px solid currentColor;border-radius:4px}.lock:before{position:absolute;bottom:12px;left:3px;width:10px;height:9px;border:2px solid currentColor;border-bottom:0;border-radius:9px 9px 0 0;content:""}.kicker{color:#5b5bd6;font-size:10px;font-weight:800;letter-spacing:.15em}.title{margin:9px 0 0;font-size:25px;font-weight:750;letter-spacing:-.03em}.text{margin:12px auto 0;max-width:340px;color:#697386;font-size:13px;line-height:1.65}.countdown{margin:20px 0 0;color:#4444b7;font-size:32px;font-weight:750;letter-spacing:.04em}.action{width:100%;min-height:46px;margin-top:24px;border:0;border-radius:11px;color:#fff;background:#5b5bd6;font:700 13px inherit;cursor:pointer;box-shadow:0 8px 18px rgba(91,91,214,.22)}.action:hover{background:#4b4bc0}.action[hidden]{display:none}.note{display:flex;justify-content:center;align-items:center;gap:7px;margin-top:20px;color:#8a93a4;font-size:10px}.dot{width:6px;height:6px;border-radius:50%;background:#18a37a}
        </style>
        <div class="screen"><section class="card"><div class="mark"><span class="lock"></span></div><div class="kicker"></div><h1 class="title"></h1><p class="text"></p><div class="countdown" hidden></div><button class="action" type="button"></button><div class="note"><span class="dot"></span>Bảo vệ cục bộ trên thiết bị này</div></section></div>`;
      shadow.querySelector('.action').addEventListener('click', () => {
        safeSendMessage({ type: 'OPEN_UNLOCK', host: currentState?.reason === 'site' ? currentState.host : '' });
      });
      (document.documentElement || document).appendChild(host);
    }
    shadow.querySelector('.kicker').textContent = copy.kicker;
    shadow.querySelector('.title').textContent = copy.title;
    shadow.querySelector('.text').textContent = copy.text;
    const button = shadow.querySelector('.action');
    button.textContent = copy.button;
    button.hidden = !copy.button;
    updateCountdown(shadow, state);
    startupCurtain.remove();
  }

  function enforceOverlay() {
    if (!blocked || !currentState) return;
    if (!host?.isConnected || !shadow) {
      host = null;
      shadow = null;
      mountOverlay(currentState);
      return;
    }
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important;display:block!important;contain:strict!important;pointer-events:all!important;visibility:visible!important';
  }

  function applyState(state) {
    if (!document.documentElement) {
      rootReady.then(() => applyState(state));
      return;
    }
    currentState = state;
    if (state?.blocked) {
      blocked = true;
      mountOverlay(state);
      originalOverflow = document.documentElement.style.overflow;
      document.documentElement.style.setProperty('overflow', 'hidden', 'important');
      if (document.body) document.body.style.setProperty('overflow', 'hidden', 'important');
      pauseMedia();
      if (!mediaObserver) {
        mediaObserver = new MutationObserver(pauseMedia);
        mediaObserver.observe(document.documentElement, { childList: true, subtree: true });
      }
      try { document.activeElement?.blur(); } catch {}
    } else {
      blocked = false;
      startupCurtain.remove();
      clearInterval(countdownTimer);
      host?.remove();
      host = null;
      shadow = null;
      mediaObserver?.disconnect();
      mediaObserver = null;
      document.documentElement.style.overflow = originalOverflow;
      if (document.body) document.body.style.overflow = '';
      resumeMedia();
    }
  }

  function requestState() {
    safeSendMessage({ type: 'GET_PAGE_STATE', url: location.href }, (state, error) => {
      if (error) {
        startupCurtain.remove();
        return;
      }
      applyState(state);
    });
  }

  let activityTimer = null;
  function pingActivity() {
    if (blocked) return;
    clearTimeout(activityTimer);
    activityTimer = setTimeout(() => safeSendMessage({ type: 'USER_ACTIVITY' }), 350);
  }

  ['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(name => window.addEventListener(name, pingActivity, { passive: true }));
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'PAGE_STATE_CHANGED') applyState(message);
    if (message?.type === 'LOCK_STATE_CHANGED') requestState();
  });
  document.addEventListener('visibilitychange', requestState);
  rootReady.then(() => {
    requestState();
    watchdogTimer = setInterval(() => {
      enforceOverlay();
      requestState();
    }, 2000);
  });
})();
