/* ============================================================
   analizar-llamadas.js
   Compara el proyecto ACTUAL contra una versión de referencia
   (la del 18 con 6k llamadas) y reporta las regresiones que
   disparan llamadas a Appwrite, según 4 reglas:
     1. Polling (setInterval/refreshInterval que hace fetch)
     2. Lecturas directas a Appwrite desde el cliente
     3. fetch dentro de useEffect / flujo de render
     4. Micro-consultas en bucles (listDocuments dentro de map/for)
   Uso:  node analizar-llamadas.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const NEW_DIR = path.join(__dirname, 'src');
const OLD_DIR = 'C:/Proyectos/ALTERNATIVAS/src';

const EXrx = /\.(tsx?|jsx?)$/;

function walk(dir, base = dir, out = {}) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
      walk(full, base, out);
    } else if (EXrx.test(e.name)) {
      out[path.relative(base, full).replace(/\\/g, '/')] = full;
    }
  }
  return out;
}

const isClient = (src) => /^['"]use client['"]/.test(src.trimStart());

function metrics(src) {
  const count = (rx) => (src.match(rx) || []).length;
  // ¿Hay un setInterval cuyo cuerpo (siguientes ~400 chars) hace fetch/lectura?
  let pollingFetch = 0;
  const reIv = /setInterval\s*\(/g; let m;
  while ((m = reIv.exec(src))) {
    const body = src.slice(m.index, m.index + 500);
    if (/(fetch\(|listDocuments|getDocument|getServices|mutate\()/.test(body)) pollingFetch++;
  }
  // ¿listDocuments/getDocument dentro de un .map( o for( ... )?  (micro-queries en bucle)
  let loopQueries = 0;
  const reLoop = /(\.map\s*\(|\bfor\s*\(|\.forEach\s*\()/g;
  while ((m = reLoop.exec(src))) {
    const body = src.slice(m.index, m.index + 600);
    if (/(listDocuments|getDocument)\(/.test(body)) loopQueries++;
  }
  return {
    client: isClient(src),
    refreshInterval: count(/refreshInterval/g),
    pollingFetch,
    clientReads: count(/getServices\(|databases\.listDocuments|databases\.getDocument/g),
    apiFetch: count(/fetch\(\s*[`'"]\/api\//g),
    bigLimit: count(/limit=10000|Query\.limit\(\s*(?:500|1000|5000|10000)\s*\)|values:\s*\[\s*(?:500|1000|5000|10000)\s*\]/g),
    useEffect: count(/useEffect\(/g),
    loopQueries,
  };
}

const oldFiles = walk(OLD_DIR);
const newFiles = walk(NEW_DIR);

const rows = [];
for (const rel of Object.keys(newFiles)) {
  let nsrc = ''; try { nsrc = fs.readFileSync(newFiles[rel], 'utf8'); } catch { continue; }
  const nm = metrics(nsrc);
  let om = null;
  if (oldFiles[rel]) { try { om = metrics(fs.readFileSync(oldFiles[rel], 'utf8')); } catch {} }

  // "peligro" = patrones que generan llamadas, ponderado
  const danger = (m) => m ? (m.refreshInterval*5 + m.pollingFetch*5 + m.clientReads*2 + m.bigLimit*3 + m.loopQueries*4 + (m.client ? m.apiFetch : 0)) : 0;
  const dN = danger(nm), dO = danger(om);
  rows.push({ rel, isNew: !om, nm, om, dN, dO, delta: dN - dO });
}

// Reporte 1: regresiones (NEW peor que OLD) o archivos nuevos peligrosos
const regressions = rows.filter(r => r.delta > 0 || (r.isNew && r.dN > 0)).sort((a,b) => b.delta - a.delta || b.dN - a.dN);

console.log('\n══════════ REGRESIONES (más llamadas que el 18) ══════════');
console.log('archivo | Δpeligro | refreshIv | pollFetch | clientReads | apiFetch | bigLimit | loopQ | nuevo?');
for (const r of regressions.slice(0, 30)) {
  const n = r.nm;
  console.log(
    `${r.rel}\n   Δ=${r.delta}  refreshIv:${(r.om?.refreshInterval||0)}→${n.refreshInterval}  poll:${(r.om?.pollingFetch||0)}→${n.pollingFetch}  reads:${(r.om?.clientReads||0)}→${n.clientReads}  apiFetch:${(r.om?.apiFetch||0)}→${n.apiFetch}  bigLimit:${(r.om?.bigLimit||0)}→${n.bigLimit}  loopQ:${(r.om?.loopQueries||0)}→${n.loopQueries}  ${r.isNew?'[NUEVO]':''}`
  );
}

// Reporte 2: top absolutos en el proyecto actual (independiente del 18)
console.log('\n══════════ TOP archivos por "peligro" en el proyecto ACTUAL ══════════');
const top = [...rows].sort((a,b)=>b.dN-a.dN).slice(0,15);
for (const r of top) {
  const n = r.nm;
  console.log(`${r.rel}  | peligro=${r.dN} client=${n.client} reads=${n.clientReads} apiFetch=${n.apiFetch} bigLimit=${n.bigLimit} loopQ=${n.loopQueries} poll=${n.pollingFetch} refreshIv=${n.refreshInterval}`);
}
console.log('\n(reads=lecturas Appwrite directas en cliente, bigLimit=consultas de 500+ filas, loopQ=consultas dentro de bucles, poll=setInterval que hace fetch)');
