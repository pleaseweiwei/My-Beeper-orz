import zipfile, os, sys

src = os.path.join(os.path.dirname(__file__), 'android', 'app', 'src', 'main', 'assets', 'www')
dst = os.path.join(os.path.dirname(__file__), 'web_update.zip')

if os.path.exists(dst):
    os.remove(dst)

count = 0
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            rel  = os.path.relpath(full, src)
            z.write(full, rel)
            count += 1
            print(f"  + {rel}")

print(f"\nOK! 共打包 {count} 个文件 -> web_update.zip")
size = os.path.getsize(dst)
print(f"   大小: {size/1024:.1f} KB")
