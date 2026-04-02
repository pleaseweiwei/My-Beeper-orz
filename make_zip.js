// 用纯 Node.js (无第三方依赖) 打包 web_update.zip
// 手动实现 ZIP local file header + deflate + central directory
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'www');
const DST = path.join(__dirname, 'web_update.zip');

// CRC-32 table
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function walkSync(dir, base, list) {
  base = base || dir;
  list = list || [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkSync(full, base, list);
    else list.push({ full, rel: path.relative(base, full).replace(/\\/g, '/') });
  }
  return list;
}

const files  = walkSync(SRC);
const chunks = [];
const central = [];
let offset = 0;

for (const { full, rel } of files) {
  const raw  = fs.readFileSync(full);
  const comp = zlib.deflateRawSync(raw, { level: 6 });
  const crc  = crc32(raw);
  const nameBytes = Buffer.from(rel, 'utf8');
  const now  = new Date();
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);

  // Local file header
  const lh = Buffer.alloc(30 + nameBytes.length);
  lh.writeUInt32LE(0x04034b50, 0);   // signature
  lh.writeUInt16LE(20, 4);           // version needed
  lh.writeUInt16LE(0, 6);            // flags
  lh.writeUInt16LE(8, 8);            // deflate
  lh.writeUInt16LE(dosTime, 10);
  lh.writeUInt16LE(dosDate, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(raw.length, 22);
  lh.writeUInt16LE(nameBytes.length, 26);
  lh.writeUInt16LE(0, 28);
  nameBytes.copy(lh, 30);

  // Central directory entry
  const cd = Buffer.alloc(46 + nameBytes.length);
  cd.writeUInt32LE(0x02014b50, 0);   // signature
  cd.writeUInt16LE(20, 4);           // version made by
  cd.writeUInt16LE(20, 6);           // version needed
  cd.writeUInt16LE(0, 8);            // flags
  cd.writeUInt16LE(8, 10);           // deflate
  cd.writeUInt16LE(dosTime, 12);
  cd.writeUInt16LE(dosDate, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(raw.length, 24);
  cd.writeUInt16LE(nameBytes.length, 28);
  cd.writeUInt16LE(0, 30);           // extra
  cd.writeUInt16LE(0, 32);           // comment
  cd.writeUInt16LE(0, 34);           // disk start
  cd.writeUInt16LE(0, 36);           // internal attr
  cd.writeUInt32LE(0, 38);           // external attr
  cd.writeUInt32LE(offset, 42);      // local header offset
  nameBytes.copy(cd, 46);

  chunks.push(lh, comp);
  central.push(cd);
  offset += lh.length + comp.length;
  process.stdout.write('  + ' + rel + '\n');
}

const cdBuf  = Buffer.concat(central);
const eocd   = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(cdBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

const out = Buffer.concat([...chunks, cdBuf, eocd]);
fs.writeFileSync(DST, out);
console.log('\nOK! 共打包 ' + files.length + ' 个文件 -> web_update.zip');
console.log('   大小: ' + (out.length / 1024).toFixed(1) + ' KB');
