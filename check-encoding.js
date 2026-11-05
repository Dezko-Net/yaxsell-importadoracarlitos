const fs = require('fs');
const path = require('path');

function walk(d) {
  const files = fs.readdirSync(d);
  for (const f of files) {
    const fp = path.join(d, f);
    const st = fs.statSync(fp);
    if (st.isDirectory()) {
      if (!f.includes('node_modules') && !f.includes('.next') && !f.startsWith('.')) {
        walk(fp);
      }
    } else if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      const b = fs.readFileSync(fp);
      let valid = true;
      for (let i = 0; i < b.length; i++) {
        if (b[i] > 127) {
          if ((b[i] & 0xE0) == 0xC0 && i + 1 < b.length && (b[i + 1] & 0xC0) == 0x80) {
            i += 1;
          } else if ((b[i] & 0xF0) == 0xE0 && i + 2 < b.length && (b[i + 1] & 0xC0) == 0x80 && (b[i + 2] & 0xC0) == 0x80) {
            i += 2;
          } else if ((b[i] & 0xF8) == 0xF0 && i + 3 < b.length && (b[i + 1] & 0xC0) == 0x80 && (b[i + 2] & 0xC0) == 0x80 && (b[i + 3] & 0xC0) == 0x80) {
            i += 3;
          } else {
            valid = false;
            break;
          }
        }
      }
      if (!valid) console.log('CORRUPT:', fp);
    }
  }
}

walk('C:/Proyectos/PROJECT YAXSELL (FIREBASE)/src');
console.log('Done checking');
