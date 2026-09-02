const https = require('https');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const base = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'www', 'lib');
console.log('base:', base);

fs.mkdirSync(path.join(base, 'fontawesome', 'css'), { recursive: true });
fs.mkdirSync(path.join(base, 'fontawesome', 'webfonts'), { recursive: true });
fs.mkdirSync(path.join(base, 'js'), { recursive: true });
console.log('dirs OK');

function dl(url, dest) {
  return new Promise((resolve, reject) => {
    const temp = dest + '.part';
    const file = fs.createWriteStream(temp);
    const request = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        res.resume();
        fs.unlink(temp, () => {});
        dl(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        file.close();
        res.resume();
        fs.unlink(temp, () => {});
        console.log('FAIL', url, 'HTTP ' + res.statusCode);
        resolve();
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        fs.renameSync(temp, dest);
        const size = fs.statSync(dest).size;
        console.log('OK', path.basename(dest), size);
        resolve();
      });
    }).on('error', err => {
      file.destroy();
      fs.unlink(temp, () => {});
      console.log('FAIL', url, err.message);
      resolve();
    });
    request.setTimeout(12000, () => request.destroy(new Error('timeout')));
  });
}

const FA = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2';

(async () => {
  await dl(FA + '/css/all.min.css',               path.join(base, 'fontawesome', 'css', 'all.min.css'));
  await dl(FA + '/webfonts/fa-solid-900.woff2',   path.join(base, 'fontawesome', 'webfonts', 'fa-solid-900.woff2'));
  await dl(FA + '/webfonts/fa-regular-400.woff2', path.join(base, 'fontawesome', 'webfonts', 'fa-regular-400.woff2'));
  await dl(FA + '/webfonts/fa-brands-400.woff2',  path.join(base, 'fontawesome', 'webfonts', 'fa-brands-400.woff2'));
  await dl('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js',
           path.join(base, 'js', 'mammoth.browser.min.js'));
  await dl('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
           path.join(base, 'js', 'html2canvas.min.js'));
  console.log('ALL DONE');
})();
