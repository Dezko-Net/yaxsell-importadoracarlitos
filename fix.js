const fs = require('fs');
const p = 'C:/Proyectos/PROYECTO Importadora Carlitos/PROJECT YAXSEL (PRODUCCION) - 14-06-2026 (3GB)/public/shopify/catalogo-original/index.html';
let c = fs.readFileSync(p, 'utf8');
const old = '<span class="brand-mark"><img src="https://storage.googleapis.com/asistoraerp.firebasestorage.app/IADESIGN/2026/07/1784931626518-pegada-1784931599359.png" alt="DB" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></span>';
const nw = '<span class="brand-mark">DB</span>';
if (c.includes(old)) {
  c = c.replace(old, nw);
  fs.writeFileSync(p, c, 'utf8');
  console.log('REPLACED OK');
} else {
  console.log('OLD NOT FOUND');
  console.log('Has brand-mark:', c.includes('brand-mark'));
  console.log('Has img src:', c.includes('storage.googleapis.com'));
  // Try to find what's actually there
  const idx = c.indexOf('brand-mark');
  if (idx >= 0) {
    console.log('Context around brand-mark:', JSON.stringify(c.substring(idx-10, idx+200)));
  }
}
