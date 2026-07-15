const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.events = [];
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.offsetWidth = 1;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  hasAttribute(name) { return this.attributes.has(name); }
  toggleAttribute(name, force) { force ? this.attributes.set(name, '') : this.attributes.delete(name); }
  dispatchEvent(event) { this.events.push(event); return true; }
  querySelectorAll() { return this._cells || []; }
}

const registry = new Map();
const context = vm.createContext({
  HTMLElement: FakeElement,
  customElements: { get: name => registry.get(name), define: (name, value) => registry.set(name, value) },
  Event: class Event { constructor(type) { this.type = type; } },
  CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  setTimeout: callback => callback()
});

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'pin-input.js'), 'utf8'), context);
const PinInput = registry.get('pin-input');

function makePin(length) {
  const pin = new PinInput();
  pin.setAttribute('length', length);
  pin._cells = Array.from({ length }, () => ({ value: '', type: 'password', focus() { this.focused = true; } }));
  return pin;
}

const four = makePin(4);
four._cells[0].value = '7';
four.onInput({ target: four._cells[0] }, 0);
assert.equal(four.value, '7');
assert.equal(four.cells[1].focused, true);

four._cells.forEach(cell => { cell.focused = false; cell.value = ''; });
four.onPaste({ clipboardData: { getData: () => '12 34' }, preventDefault() {} }, 0);
assert.equal(four.value, '1234');
assert.equal(Array.from(four.cells, cell => cell.value).join(''), '1234');
assert.equal(four.events.some(event => event.type === 'pin-complete' && event.detail.value === '1234'), true);

four._cells[3].value = '';
let prevented = false;
four.onKeydown({ key: 'Backspace', currentTarget: four._cells[3], preventDefault() { prevented = true; } }, 3);
assert.equal(prevented, true);
assert.equal(four._cells[2].value, '');
assert.equal(four._cells[2].focused, true);

four._cells.forEach(cell => { cell.focused = false; });
four.onKeydown({ key: 'ArrowRight', currentTarget: four._cells[0], preventDefault() {} }, 0);
assert.equal(four._cells[1].focused, true);

const six = makePin(6);
six.setValue('654321');
assert.equal(six.value, '654321');
assert.equal(six.cells.length, 6);
assert.equal(six.events.some(event => event.type === 'pin-complete'), true);

console.log('PIN input smoke test: OK');
