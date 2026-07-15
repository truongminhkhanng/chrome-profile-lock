(() => {
  const { normalizeHostname } = PLDomain;

  class DomainChipInput extends HTMLElement {
    constructor() { super(); this._values = []; this._opposites = []; }
    connectedCallback() { this.render(); }
    get value() { return [...this._values]; }
    set value(values) { this._values = [...new Set((values || []).map(String))]; if (this.isConnected) this.render(); }
    set opposites(values) { this._opposites = values || []; }
    render() {
      this.replaceChildren();
      const chips = document.createElement('div'); chips.className = 'domain-chips'; chips.setAttribute('aria-live', 'polite');
      this._values.forEach(domain => {
        const chip = document.createElement('span'); chip.className = 'domain-chip'; chip.textContent = domain;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Xóa ${domain}`);
        remove.addEventListener('click', () => this.remove(domain)); chip.append(remove); chips.append(chip);
      });
      const row = document.createElement('div'); row.className = 'domain-entry';
      const input = document.createElement('input'); input.type = 'text'; input.placeholder = this.getAttribute('placeholder') || 'Nhập website hoặc URL…'; input.setAttribute('aria-label', this.getAttribute('aria-label') || 'Nhập website');
      const add = document.createElement('button'); add.type = 'button'; add.className = 'button button-secondary'; add.textContent = 'Thêm';
      const error = document.createElement('p'); error.className = 'field-error'; error.setAttribute('role', 'alert');
      add.addEventListener('click', () => this.addRaw(input.value));
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); this.addRaw(input.value); }
        if (event.key === 'Backspace' && !input.value && this._values.length) this.remove(this._values.at(-1));
      });
      input.addEventListener('paste', event => {
        const text = event.clipboardData?.getData('text') || '';
        if (!/[\n,]/.test(text)) return;
        event.preventDefault(); this.addRaw(text);
      });
      row.append(input, add); this.append(chips, row, error); this._input = input; this._error = error;
    }
    addRaw(raw) {
      this._error.textContent = '';
      const parts = String(raw || '').split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
      if (!parts.length) return this.fail('Vui lòng nhập website hoặc URL.');
      try {
        for (const part of parts) {
          const domain = normalizeHostname(part);
          if (this._values.includes(domain)) throw new Error(`${domain} đã có trong danh sách.`);
          if (this._opposites.includes(domain)) throw new Error(`${domain} đang nằm trong danh sách đối lập.`);
          this._values.push(domain);
        }
        this.render(); this.dispatchEvent(new Event('change', { bubbles: true })); this._input.focus();
      } catch (error) { this.fail(error.message); }
    }
    remove(domain) { this._values = this._values.filter(item => item !== domain); this.render(); this.dispatchEvent(new Event('change', { bubbles: true })); this._input.focus(); }
    fail(message) { this._error.textContent = message; this._input.focus(); }
    focus() { this._input?.focus(); }
  }
  customElements.define('domain-chip-input', DomainChipInput);

  let opener = null;
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.hidden = true;
  overlay.innerHTML = `<section class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle" aria-describedby="modalDescription"><h2 id="modalTitle"></h2><p id="modalDescription"></p><div class="modal-actions"><button type="button" class="button button-secondary" data-modal-cancel>Hủy</button><button type="button" class="button button-primary" data-modal-confirm>Xác nhận</button></div></section>`;
  document.addEventListener('DOMContentLoaded', () => document.body.append(overlay), { once: true });
  let resolver = null;
  function close(result) { overlay.hidden = true; document.removeEventListener('keydown', onKeydown, true); resolver?.(result); resolver = null; opener?.focus(); }
  function onKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(false); return; }
    if (event.key !== 'Tab') return;
    const controls = [...overlay.querySelectorAll('button')]; const first = controls[0]; const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('[data-modal-cancel]')) close(false); if (event.target.closest('[data-modal-confirm]')) close(true); });
  function confirmModal({ title, description, confirmText = 'Xác nhận', destructive = false, trigger = document.activeElement }) {
    opener = trigger; overlay.querySelector('#modalTitle').textContent = title; overlay.querySelector('#modalDescription').textContent = description;
    const confirm = overlay.querySelector('[data-modal-confirm]'); confirm.textContent = confirmText; confirm.classList.toggle('button-danger-solid', destructive);
    overlay.hidden = false; document.addEventListener('keydown', onKeydown, true); overlay.querySelector('[data-modal-cancel]').focus();
    return new Promise(resolve => { resolver = resolve; });
  }
  window.PLUI = { normalizeHostname, confirmModal };
})();
