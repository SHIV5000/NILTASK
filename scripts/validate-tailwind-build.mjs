import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const output = path.join(root, 'css', 'tailwind.generated.css');

const failures = [];
const passes = [];

function check(condition, label, detail = '') {
  if (condition) passes.push(label);
  else failures.push(detail ? `${label}: ${detail}` : label);
}

check(fs.existsSync(output), 'Generated Tailwind CSS exists');

let css = '';
if (fs.existsSync(output)) css = fs.readFileSync(output, 'utf8');

check(css.length >= 5000, 'Generated Tailwind CSS is non-trivial', `size=${css.length} bytes`);

const requiredPatterns = [
  [/\.flex\{[^}]*display:flex/, 'flex utility'],
  [/\.hidden\{[^}]*display:none/, 'hidden utility'],
  [/\.h-screen\{[^}]*height:100vh/, 'h-screen utility'],
  [/\.overflow-hidden\{[^}]*overflow:hidden/, 'overflow-hidden utility'],
  [/\.items-center\{[^}]*align-items:center/, 'items-center utility'],
  [/\.justify-center\{[^}]*justify-content:center/, 'justify-center utility'],
  [/\.bg-indigo-50\{[^}]*background-color:/, 'indigo background utility'],
  [/\.text-xs\{[^}]*font-size:/, 'text-xs utility'],
  [/\.rounded-xl\{[^}]*border-radius:/, 'rounded-xl utility'],
  [/\.text-\\\[11px\\\]\{[^}]*font-size:11px/, 'arbitrary text size utility'],
  [/\.hover\\:bg-gray-100:hover\{[^}]*background-color:/, 'hover background variant'],
];

for (const [pattern, label] of requiredPatterns) {
  check(pattern.test(css), `Generated CSS contains ${label}`);
}

check(!css.includes('cdn.tailwindcss.com'), 'Generated CSS has no browser-CDN dependency');

if (failures.length) {
  console.error(`\nTailwind build validation FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\nPassed checks: ${passes.length}`);
  process.exit(1);
}

console.log(`Tailwind build validation passed: ${passes.length} checks, ${css.length} bytes.`);
