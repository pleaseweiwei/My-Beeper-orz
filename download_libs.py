import urllib.request, os, sys

base = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    'android', 'app', 'src', 'main', 'assets', 'www', 'lib')

print('base:', base, flush=True)

os.makedirs(base + '/fontawesome/css', exist_ok=True)
os.makedirs(base + '/fontawesome/webfonts', exist_ok=True)
os.makedirs(base + '/js', exist_ok=True)
print('dirs created', flush=True)

headers = {'User-Agent': 'Mozilla/5.0'}

def dl(url, path):
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        with open(path, 'wb') as f:
            f.write(data)
        print('OK', os.path.basename(path), len(data), flush=True)
    except Exception as e:
        print('FAIL', url, str(e), flush=True)

FA_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2'
dl(FA_BASE + '/css/all.min.css',               base + '/fontawesome/css/all.min.css')
dl(FA_BASE + '/webfonts/fa-solid-900.woff2',   base + '/fontawesome/webfonts/fa-solid-900.woff2')
dl(FA_BASE + '/webfonts/fa-regular-400.woff2', base + '/fontawesome/webfonts/fa-regular-400.woff2')
dl(FA_BASE + '/webfonts/fa-brands-400.woff2',  base + '/fontawesome/webfonts/fa-brands-400.woff2')

dl('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js',
   base + '/js/mammoth.browser.min.js')
dl('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
   base + '/js/html2canvas.min.js')

print('ALL DONE', flush=True)
