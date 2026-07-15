const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ URL });
for (const file of ['domain-utils.js', 'theme-utils.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), context, { filename: file });
}

assert.equal(context.PLDomain.normalizeHostname('https://www.example.com/path?q=1'), 'example.com');
assert.equal(context.PLDomain.normalizeHostname('example.com'), 'example.com');
assert.equal(context.PLDomain.normalizeHostname('sub.example.com'), 'sub.example.com');
assert.throws(() => context.PLDomain.normalizeHostname('chrome://settings'), /không được hỗ trợ/);
assert.throws(() => context.PLDomain.normalizeHostname('not a domain'), /không hợp lệ/);

assert.equal(Math.round(context.PLTheme.getContrastRatio('#000000', '#ffffff') * 10) / 10, 21);
assert.equal(context.PLTheme.getAccessibleTextColor('#ffffff'), '#18181b');
assert.equal(context.PLTheme.getAccessibleTextColor('#111111'), '#ffffff');
assert.ok(context.PLTheme.getContrastRatio(context.PLTheme.getAccessibleInteractiveColor('#ffff00', '#ffffff'), '#ffffff') >= 3);
assert.ok(context.PLTheme.getContrastRatio(context.PLTheme.getAccessibleInteractiveColor('#000033', '#19191c'), '#19191c') >= 3);

console.log('UI utility smoke test: OK');
