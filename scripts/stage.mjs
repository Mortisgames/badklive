import { mkdir, copyFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { shellFiles } from './prepare-sw.mjs';
await rm('_site', { recursive: true, force: true });
for (const file of [...await shellFiles(), 'sw.js']) {
  await mkdir(dirname('_site/' + file), { recursive: true });
  await copyFile(file, '_site/' + file);
}
console.log('Static files staged in _site/');
