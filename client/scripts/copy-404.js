import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// GitHub Pages answers a path it has no file for with 404.html, and a client route like /scheduler has no
// file behind it. Copying the built index.html there means a deep link or a refresh lands on the same
// document a visitor gets at the root, and the router takes it from there instead of a GitHub 404 page.
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

copyFileSync(join(dist, 'index.html'), join(dist, '404.html'));

console.log('copied dist/index.html to dist/404.html');
