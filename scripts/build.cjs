const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
fs.cpSync(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
fs.writeFileSync(path.join(dist, '.gitkeep'), '');

console.log('Build completed: dist/');
