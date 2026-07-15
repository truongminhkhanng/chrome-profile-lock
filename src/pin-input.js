(() => {
  if (customElements.get('pin-input')) return;

  class PinInput extends HTMLElement {
    static get observedAttributes() { return ['length', 'disabled']; }

    constructor() {
      super();
      this._value = '';
      this._completeValue = '';
    }

    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }

    get length() { return Number(this.getAttribute('length')) === 6 ? 6 : 4; }
    set length(value) { this.setAttribute('length', Number(value) === 6 ? '6' : '4'); }
    get value() { return this._value; }
    set value(value) { this.setValue(value); }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(value) { this.toggleAttribute('disabled', !!value); }

    render() {
      const prior = this._value;
      this.replaceChildren();
      this.classList.toggle('pin-input-six', this.length === 6);
      const fields = document.createElement('div');
      fields.className = 'pin-input-fields';
      fields.setAttribute('role', 'group');
      fields.setAttribute('aria-label', this.getAttribute('aria-label') || `Mã PIN ${this.length} số`);
      for (let index = 0; index < this.length; index++) {
        const input = document.createElement('input');
        input.className = 'pin-input-cell';
        input.type = 'password';
        input.inputMode = 'numeric';
        input.pattern = '[0-9]*';
        input.maxLength = 1;
        input.autocomplete = index === 0 ? 'one-time-code' : 'off';
        input.disabled = this.disabled;
        input.setAttribute('aria-label', `Số thứ ${index + 1} trong ${this.length}`);
        input.addEventListener('input', event => this.onInput(event, index));
        input.addEventListener('keydown', event => this.onKeydown(event, index));
        input.addEventListener('paste', event => this.onPaste(event, index));
        fields.appendChild(input);
      }
      const reveal = document.createElement('button');
      reveal.className = 'pin-input-reveal';
      reveal.type = 'button';
      reveal.textContent = 'Hiện';
      reveal.setAttribute('aria-label', 'Hiện mã PIN');
      reveal.disabled = this.disabled;
      reveal.addEventListener('click', () => this.toggleReveal(reveal));
      this.append(fields, reveal);
      this.setValue(prior, false);
    }

    get cells() { return [...this.querySelectorAll('.pin-input-cell')]; }

    setValue(value, emit = true) {
      const digits = String(value || '').replace(/\D/g, '').slice(0, this.length);
      this._value = digits;
      if (digits.length !== this.length) this._completeValue = '';
      this.cells.forEach((cell, index) => { cell.value = digits[index] || ''; });
      this.classList.remove('pin-input-error');
      if (emit) this.dispatchEvent(new Event('input', { bubbles: true }));
      this.checkComplete();
    }

    onInput(event, index) {
      const digits = event.target.value.replace(/\D/g, '');
      event.target.value = digits.slice(-1);
      this.syncValue();
      if (event.target.value && index < this.length - 1) this.cells[index + 1].focus();
      this.checkComplete();
    }

    onKeydown(event, index) {
      if (event.key === 'Backspace' && !event.currentTarget.value && index > 0) {
        event.preventDefault();
        this.cells[index - 1].value = '';
        this.cells[index - 1].focus();
        this.syncValue();
      }
      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        this.cells[index - 1].focus();
      }
      if (event.key === 'ArrowRight' && index < this.length - 1) {
        event.preventDefault();
        this.cells[index + 1].focus();
      }
    }

    onPaste(event, index) {
      const digits = event.clipboardData?.getData('text').replace(/\D/g, '') || '';
      if (!digits) return;
      event.preventDefault();
      const current = this.cells.map(cell => cell.value);
      digits.slice(0, this.length - index).split('').forEach((digit, offset) => { current[index + offset] = digit; });
      this.setValue(current.join(''));
      this.cells[Math.min(index + digits.length, this.length) - 1]?.focus();
    }

    syncValue() {
      this._value = this.cells.map(cell => cell.value).join('');
      this.classList.remove('pin-input-error');
      this.dispatchEvent(new Event('input', { bubbles: true }));
    }

    checkComplete() {
      if (this._value.length !== this.length || this._completeValue === this._value) return;
      this._completeValue = this._value;
      this.dispatchEvent(new CustomEvent('pin-complete', { bubbles: true, detail: { value: this._value } }));
    }

    toggleReveal(button) {
      const reveal = this.cells[0]?.type === 'password';
      this.cells.forEach(cell => { cell.type = reveal ? 'text' : 'password'; });
      button.textContent = reveal ? 'Ẩn' : 'Hiện';
      button.setAttribute('aria-label', reveal ? 'Ẩn mã PIN' : 'Hiện mã PIN');
    }

    focus() { this.cells.find(cell => !cell.value)?.focus() || this.cells[0]?.focus(); }

    clear() {
      this._completeValue = '';
      this.setValue('', false);
      this.focus();
    }

    showError() {
      this.classList.remove('pin-input-error');
      void this.offsetWidth;
      this.classList.add('pin-input-error');
      setTimeout(() => this.clear(), 360);
    }
  }

  customElements.define('pin-input', PinInput);
})();
