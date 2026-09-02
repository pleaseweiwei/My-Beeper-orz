const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const projectRoot = path.resolve(__dirname, '..');
const fontDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'www', 'lib', 'fonts');
fs.mkdirSync(fontDir, { recursive: true });

// User-Agent that returns woff2 format
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function fetch(reqUrl, binary) {
  return new Promise((resolve, reject) => {
    const opts = url.parse(reqUrl);
    opts.headers = { 'User-Agent': UA };
    const request = https.get(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, binary).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
    request.setTimeout(12000, () => request.destroy(new Error('timeout')));
  });
}

async function downloadGoogleFont(googleUrl, cssOutName) {
  console.log('Fetching CSS:', cssOutName);
  let css;
  try {
    css = await fetch(googleUrl, false);
  } catch (error) {
    console.error('  CSS FAILED:', error.message);
    return false;
  }

  // Find all woff2 URLs
  const urlRegex = /url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/g;
  const fontUrls = [];
  let m;
  while ((m = urlRegex.exec(css)) !== null) {
    fontUrls.push(m[1]);
  }
  console.log('  Found', fontUrls.length, 'font files');

  // Download each font file
  if (fontUrls.length === 0) {
    console.error('  No woff2 files found');
    return false;
  }

  let complete = true;
  for (const fontUrl of fontUrls) {
    const fname = fontUrl.split('/').pop().split('?')[0];
    const dest = path.join(fontDir, fname);
    if (!fs.existsSync(dest)) {
      try {
        const data = await fetch(fontUrl, true);
        fs.writeFileSync(dest + '.part', data);
        fs.renameSync(dest + '.part', dest);
        console.log('  OK', fname, data.length);
      } catch (error) {
        complete = false;
        fs.unlink(dest + '.part', () => {});
        console.error('  FONT FAILED:', fname, error.message);
      }
    } else {
      console.log('  SKIP', fname, '(exists)');
    }
    // Replace URL in CSS with local path
    css = css.replace(fontUrl, `../fonts/${fname}`);
  }

  if (!complete) {
    console.error('  CSS NOT WRITTEN because one or more fonts failed');
    return false;
  }

  // Save patched CSS
  const cssPath = path.join(fontDir, cssOutName);
  fs.writeFileSync(cssPath, css, 'utf8');
  console.log('  Saved CSS:', cssOutName);
  return true;
}

(async () => {
  try {
    const mainOk = await downloadGoogleFont(
      'https://fonts.googleapis.com/css2?family=Alex+Brush&family=Montserrat:wght@200;300;400;500;700&family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,700&display=swap',
      'gfonts-main.css'
    );
    const quicksandOk = await downloadGoogleFont(
      'https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&display=swap',
      'gfonts-quicksand.css'
    );
    if (!mainOk || !quicksandOk) process.exitCode = 1;
  } catch (error) {
    console.error('FONT DOWNLOAD FAILED:', error.message);
    process.exitCode = 1;
  }
  console.log('ALL DONE');
})();
