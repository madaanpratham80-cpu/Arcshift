import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

mkdirSync('public', { recursive: true });
rmSync('public/assets', { recursive: true, force: true });
cpSync('dist/web/assets', 'public/assets', { recursive: true });

const html = readFileSync('dist/web/index.html', 'utf8');
writeFileSync('dist/web-document.js', 'export default ' + JSON.stringify(html) + ';\n');
