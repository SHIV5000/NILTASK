import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const failures = [];
const passes = [];

function check(condition, label, detail = '') {
  if (condition) passes.push(label);
  else failures.push(detail ? `${label}: ${detail}` : label);
}

function absoluteFromWebPath(webPath) {
  return path.join(root, String(webPath || '').replace(/^\//, ''));
}

function readText(relative) {
  const file = path.join(root, relative);
  check(fs.existsSync(file), `Required file exists: ${relative}`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function pngDimensions(file) {
  const buffer = fs.readFileSync(file);
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a' || buffer.length < 24) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const indexHtml = readText('index.html');
const serviceWorker = readText('sw.js');
const manifestSource = readText('manifest.json');
let manifest = null;
try {
  manifest = JSON.parse(manifestSource);
  passes.push('manifest.json parses');
} catch (error) {
  failures.push(`manifest.json is invalid JSON: ${error.message}`);
}

if (manifest) {
  check(manifest.name === 'Noted For Action', 'Manifest full name is correct');
  check(Boolean(manifest.short_name), 'Manifest short name is declared');
  check(manifest.id === '/', 'Manifest id is stable');
  check(manifest.start_url === '/', 'Manifest start_url is root');
  check(manifest.scope === '/', 'Manifest scope is root');
  check(manifest.display === 'standalone', 'Manifest display mode is standalone');
  check(manifest.lang === 'en-IN', 'Manifest locale is en-IN');
  check(/^#[0-9a-f]{6}$/i.test(manifest.theme_color || ''), 'Manifest theme color is valid');
  check(/^#[0-9a-f]{6}$/i.test(manifest.background_color || ''), 'Manifest background color is valid');
  check(manifest.share_target?.action === '/share-target', 'Manifest share target action is stable');
  check(manifest.share_target?.method === 'POST', 'Manifest share target method is POST');

  const iconEntries = [
    ...(Array.isArray(manifest.icons) ? manifest.icons : []),
    ...((manifest.shortcuts || []).flatMap(shortcut => shortcut.icons || [])),
  ];
  const unique = new Map();
  for (const icon of iconEntries) {
    if (icon?.src) unique.set(`${icon.src}|${icon.sizes || ''}|${icon.type || ''}`, icon);
  }
  check(unique.size >= 5, 'Manifest declares expected icon set', `found ${unique.size}`);

  for (const icon of unique.values()) {
    const src = icon.src;
    check(typeof src === 'string' && src.startsWith('/'), `Manifest icon uses root-relative path: ${src}`);
    const file = absoluteFromWebPath(src);
    check(fs.existsSync(file), `Manifest icon exists: ${src}`);
    if (!fs.existsSync(file)) continue;

    if (icon.type === 'image/png' && /^\d+x\d+$/.test(icon.sizes || '')) {
      const [declaredWidth, declaredHeight] = icon.sizes.split('x').map(Number);
      const dimensions = pngDimensions(file);
      check(Boolean(dimensions), `Manifest PNG is valid: ${src}`);
      if (dimensions) {
        check(
          dimensions.width === declaredWidth && dimensions.height === declaredHeight,
          `Manifest PNG dimensions match declaration: ${src}`,
          `declared=${icon.sizes}, actual=${dimensions.width}x${dimensions.height}`
        );
      }
    }
  }
}

check(indexHtml.includes('<link rel="manifest" href="/manifest.json">'), 'index.html links root manifest');
check(indexHtml.includes('<meta name="theme-color"'), 'index.html declares theme color');
check(serviceWorker.includes("'/manifest.json'"), 'Service worker app shell includes manifest');
check(serviceWorker.includes("'/favicon.svg'"), 'Service worker app shell includes favicon');

for (const pushAsset of ['/icons/notif.png', '/icons/badge-96.png']) {
  check(fs.existsSync(absoluteFromWebPath(pushAsset)), `Push asset exists: ${pushAsset}`);
  check(serviceWorker.includes(`'${pushAsset}'`), `Service worker app shell includes push asset: ${pushAsset}`);
}

if (failures.length) {
  console.error(`\nPWA asset validation FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\nPassed checks: ${passes.length}`);
  process.exit(1);
}

console.log(`PWA asset validation passed: ${passes.length} checks.`);
