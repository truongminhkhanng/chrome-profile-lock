const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const root = process.argv[2] ? path.resolve(projectRoot, process.argv[2]) : projectRoot;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const requiredPaths = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_page,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap(entry => [...(entry.js || []), ...(entry.css || [])]),
  ...manifest.web_accessible_resources.flatMap(entry => entry.resources || [])
];

for (const relativePath of requiredPaths) {
  assert.equal(fs.existsSync(path.join(root, relativePath)), true, `Thiếu file Manifest: ${relativePath}`);
}

for (const page of ['popup.html', 'options.html', 'lock.html']) {
  const pagePath = path.join(root, 'src', page);
  const html = fs.readFileSync(pagePath, 'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(match => match[1])
    .filter(value => !/^(?:https?:|#)/.test(value));
  for (const reference of references) {
    assert.equal(fs.existsSync(path.resolve(path.dirname(pagePath), reference)), true, `Thiếu tài nguyên ${page}: ${reference}`);
  }
}

console.log('Structure smoke test: OK');
