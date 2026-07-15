(() => {
  function normalizeHostname(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) throw new Error('Vui lòng nhập website hoặc URL.');
    if (/^(chrome|chrome-extension|edge|about):/i.test(text)) throw new Error('Trang nội bộ của trình duyệt không được hỗ trợ.');
    try {
      const parsed = new URL(text.includes('://') ? text : `https://${text}`);
      if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) throw new Error();
      const hostname = parsed.hostname.replace(/^www\./, '').replace(/\.$/, '');
      if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostname)) throw new Error();
      return hostname;
    } catch {
      throw new Error('Website hoặc URL không hợp lệ.');
    }
  }
  globalThis.PLDomain = { normalizeHostname };
})();
