const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const fontDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'www', 'lib', 'fonts');
fs.mkdirSync(fontDir, { recursive: true });

// User-Agent that returns woff2 format
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function fetch(reqUrl, binary) {
  return new Promise((resolve, reject) => {
    const opts = url.parse(reqUrl);
    opts.headers = { 'User-Agent': UA };
    https.get(opts, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetch(res.headers.location, binary).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

async function downloadGoogleFont(googleUrl, cssOutName) {
  console.log('Fetching CSS:', cssOutName);
  let css = await fetch(googleUrl, false);

  // Find all woff2 URLs
  const urlRegex = /url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/g;
  const fontUrls = [];
  let m;
  while ((m = urlRegex.exec(css)) !== null) {
    fontUrls.push(m[1]);
  }
  console.log('  Found', fontUrls.length, 'font files');

  // Download each font file
  for (const fontUrl of fontUrls) {
    const fname = fontUrl.split('/').pop().split('?')[0];
    const dest = path.join(fontDir, fname);
    if (!fs.existsSync(dest)) {
      const data = await fetch(fontUrl, true);
      fs.writeFileSync(dest, data);
      console.log('  OK', fname, data.length);
    } else {
      console.log('  SKIP', fname, '(exists)');
    }
    // Replace URL in CSS with local path
    css = css.replace(fontUrl, `../fonts/${fname}`);
  }

  // Save patched CSS
  const cssPath = path.join(fontDir, cssOutName);
  fs.writeFileSync(cssPath, css, 'utf8');
  console.log('  Saved CSS:', cssOutName);
}

(async () => {
  await downloadGoogleFont(
    'https://fonts.googleapis.com/css2?family=Alex+Brush&family=Montserrat:wght@200;300;400;500;700&family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,700&display=swap',
    'gfonts-main.css'
  );
  await downloadGoogleFont(
    'https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&display=swap',
    'gfonts-quicksand.css'
  );
  console.log('ALL DONE');
})();
