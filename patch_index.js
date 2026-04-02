const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'www', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Google Fonts main → local
html = html.replace(
  /<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Alex\+Brush[^"]*" rel="stylesheet">/,
  '<link href="lib/fonts/gfonts-main.css" rel="stylesheet">'
);

// 2. Font Awesome CDN + crossorigin → local (no crossorigin needed for local)
html = html.replace(
  /<link id="fa-main-css" rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/6\.4\.2\/css\/all\.min\.css"[^>]*>/,
  '<link id="fa-main-css" rel="stylesheet" href="lib/fontawesome/css/all.min.css">'
);

// 3. Remove FA CDN fallback <script> block entirely
html = html.replace(
  /<script>\s*\(function\(\)\{[\s\S]*?faLoaded[\s\S]*?\}\)\(\);\s*<\/script>/,
  '<!-- FA local loaded, no fallback needed -->'
);

// 4. Mammoth CDN → local
html = html.replace(
  /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/mammoth\/1\.4\.21\/mammoth\.browser\.min\.js"><\/script>/,
  '<script src="lib/js/mammoth.browser.min.js"></script>'
);

// 5. Quicksand Google Font → local
html = html.replace(
  /<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Quicksand[^"]*" rel="stylesheet">/,
  '<link href="lib/fonts/gfonts-quicksand.css" rel="stylesheet">'
);

// 6. html2canvas CDN → local
html = html.replace(
  /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js"[^>]*><\/script>/,
  '<script src="lib/js/html2canvas.min.js"></script>'
);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Patched:', htmlPath);

// Verify no CDN links remain
const remaining = (html.match(/cdnjs\.cloudflare|fonts\.googleapis|cdn\.jsdelivr/g) || []);
if (remaining.length === 0) {
  console.log('OK: No CDN links remaining');
} else {
  console.log('WARNING: Still has CDN links:', remaining);
}
