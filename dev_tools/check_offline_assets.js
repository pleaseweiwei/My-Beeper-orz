const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const www = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'www');
const required = [
  'index.html',
  'lib/fonts/gfonts-main.css',
  'lib/fonts/gfonts-quicksand.css',
  'lib/fontawesome/css/all.min.css',
  'lib/fontawesome/webfonts/fa-solid-900.woff2',
  'lib/fontawesome/webfonts/fa-regular-400.woff2',
  'lib/fontawesome/webfonts/fa-brands-400.woff2',
  'lib/js/mammoth.browser.min.js',
  'lib/js/html2canvas.min.js',
  'lib/js/Sortable.min.js'
];

const missing = required.filter(file => !fs.existsSync(path.join(www, file)));
const htmlPath = path.join(www, 'index.html');
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
const filesToScan = [];
function collectFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full);
    else if (/\.(html|css|js)$/i.test(entry.name)) filesToScan.push(full);
  }
}
collectFiles(www);
const externalRefs = filesToScan.reduce((count, file) => {
  const content = fs.readFileSync(file, 'utf8');
  return count + (content.match(/cdnjs\.cloudflare|fonts\.googleapis|cdn\.jsdelivr/g) || []).length;
}, 0);
const musicRefs = filesToScan.reduce((count, file) => {
  const content = fs.readFileSync(file, 'utf8');
  return count + (content.match(/cdn\.jsdelivr\.net\/gh\/anars\/blank-audio/g) || []).length;
}, 0);
const cdnRefs = externalRefs - musicRefs;

console.log('Offline assets:', missing.length ? 'INCOMPLETE' : 'READY');
if (missing.length) missing.forEach(file => console.log('MISSING ' + file));
console.log('CDN references requiring offline replacement:', cdnRefs);
console.log('Runtime music CDN references (kept intentionally):', musicRefs);
process.exitCode = missing.length ? 1 : 0;