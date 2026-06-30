/*
 * Build a Chrome Web Store upload zip containing only runtime files.
 * Usage: node scripts/pack.js   ->   ghost-notes-v<version>.zip
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const INCLUDE = [
  'manifest.json',
  'background.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.css',
  'popup.js',
  'options.html',
  'options.css',
  'options.js',
  'lib',
  'icons'
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-notes-'));
const stage = path.join(tmp, 'ghost-notes');
fs.mkdirSync(stage, { recursive: true });

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) copy(path.join(src, entry), path.join(dest, entry));
  } else {
    fs.copyFileSync(src, dest);
  }
}

for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  if (fs.existsSync(src)) copy(src, path.join(stage, item));
  else console.warn('skip (missing): ' + item);
}

const out = path.join(ROOT, `ghost-notes-v${pkg.version}.zip`);
if (fs.existsSync(out)) fs.unlinkSync(out);

if (process.platform === 'win32') {
  execFileSync('powershell', [
    '-NoProfile', '-Command',
    `Compress-Archive -Path '${path.join(stage, '*')}' -DestinationPath '${out}' -Force`
  ], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-r', out, '.'], { cwd: stage, stdio: 'inherit' });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Created ' + path.relative(ROOT, out));
