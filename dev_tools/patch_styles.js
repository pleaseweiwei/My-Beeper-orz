const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

function patchContent(content, filename) {
    let changed = false;
    let newContent = content;

    // 替换 accent-color (css/html/js 通用)
    let old = newContent;
    newContent = newContent.replace(/accent-color:\s*(#[0-9a-fA-F]+|rgba?\([^)]+\))/gi, 'accent-color: var(--theme-accent)');
    if (old !== newContent) changed = true;

    // 针对 css 中的 font-size
    if (filename.endsWith('.css')) {
        old = newContent;
        newContent = newContent.replace(/font-size:\s*(\d+(?:\.\d+)?)px\s*(;|\}|!important)/g, (match, p1, p2) => {
            return `font-size: calc(${p1}px * var(--font-scale))${p2}`;
        });
        if (old !== newContent) changed = true;
    }

    // 针对 JS 和 HTML 中的内联 style="font-size: 14px"
    if (filename.endsWith('.js') || filename.endsWith('.html')) {
        old = newContent;
        newContent = newContent.replace(/font-size:\s*(\d+(?:\.\d+)?)px\s*(;|"|')/g, (match, p1, p2) => {
            return `font-size: calc(${p1}px * var(--font-scale))${p2}`;
        });
        if (old !== newContent) changed = true;
    }

    return { changed, newContent };
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (dir === rootDir && ['css', 'js'].includes(file)) {
                 walk(fullPath);
            }
        } else {
            if (file.endsWith('.css') || file.endsWith('.js') || file.endsWith('.html')) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const { changed, newContent } = patchContent(content, file);
                if (changed) {
                    fs.writeFileSync(fullPath, newContent, 'utf-8');
                    console.log(`Patched ${fullPath}`);
                }
            }
        }
    }
}

walk(rootDir);
