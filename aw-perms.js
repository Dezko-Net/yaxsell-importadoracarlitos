/* Inspecciona / modifica permisos de colección en Appwrite.
   Uso:
     node aw-perms.js get <colId>
     node aw-perms.js close <colId>   -> quita read("any")
     node aw-perms.js open  <colId>   -> re-agrega read("any") (rollback)
   La key se lee de la env AW_KEY (no se hardcodea). */
const ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
const PROJECT  = '6a0a4e8d0032177f3f90';
const DB       = '6a0a58ca001798410d86';
const KEY      = process.env.AW_KEY || '';

const [, , action, colId] = process.argv;

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': PROJECT,
  'X-Appwrite-Key': KEY,
};

async function getCol(id) {
  const r = await fetch(`${ENDPOINT}/databases/${DB}/collections/${id}`, { headers });
  if (!r.ok) throw new Error(`GET ${id} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function patchCol(id, name, permissions, documentSecurity, enabled) {
  // Appwrite: las colecciones se actualizan con PUT (PATCH es solo para documentos).
  const r = await fetch(`${ENDPOINT}/databases/${DB}/collections/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name, permissions, documentSecurity, enabled }),
  });
  if (!r.ok) throw new Error(`PUT ${id} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

(async () => {
  if (!KEY) { console.error('FALTA AW_KEY'); process.exit(1); }
  if (!action || !colId) { console.error('uso: node aw-perms.js <get|close|open> <colId>'); process.exit(1); }

  const col = await getCol(colId);
  console.log(`\n[${colId}] name="${col.name}" documentSecurity=${col.documentSecurity} enabled=${col.enabled}`);
  console.log('permisos actuales:', JSON.stringify(col.$permissions));

  if (action === 'get') return;

  const perms = col.$permissions || [];
  let next;
  if (action === 'close') {
    next = perms.filter((p) => p !== 'read("any")');
  } else if (action === 'open') {
    next = perms.includes('read("any")') ? perms : [...perms, 'read("any")'];
  } else {
    console.error('acción inválida'); process.exit(1);
  }

  if (JSON.stringify(next) === JSON.stringify(perms)) {
    console.log('-> sin cambios (ya estaba en el estado deseado)');
    return;
  }

  const updated = await patchCol(colId, col.name, next, col.documentSecurity, col.enabled);
  console.log('permisos NUEVOS:', JSON.stringify(updated.$permissions));
  console.log('OK ✔');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
