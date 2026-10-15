import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { generateWorker, shellFiles } from './prepare-sw.mjs';
const files = await shellFiles();
for (const file of [...files.filter(f => f.endsWith('.js')), 'sw.js']) {
  execFileSync(process.execPath, ['--check', file]);
  const text = await readFile(file, 'utf8');
  for (const [, specifier] of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
    await access(new URL(specifier, new URL(file, `file://${process.cwd()}/`)));
  }
}
assert.equal(await readFile('sw.js', 'utf8'), await generateWorker(), 'Run npm run prepare:sw after changing shell files');
assert.ok((await readdir('tests')).some(f => f.endsWith('.test.js')), 'No unit tests found');
const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
for (const icon of manifest.icons) await access(icon.src);
console.log(`Checked syntax, imports, manifest and offline shell (${files.length} assets).`);
