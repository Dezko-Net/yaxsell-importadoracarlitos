import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, setDoc, collection, addDoc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const app = initializeApp({ apiKey: 'AIzaSyCm2i8lYz_e000VT8tZKdBVLtDQJngq_BQ', projectId: 'yaxselldemo' });
const db = getFirestore(app, 'donbalato');

const plan = JSON.parse(fs.readFileSync('C:/Proyectos/AUTOMATIZACIONES/clean_injection_plan_35.json', 'utf8'));

async function applyPlan35() {
  console.log(`Iniciando aplicación de ${plan.length} despachos faltantes de Daniel en Firestore...`);

  let actualizados = 0;
  for (const item of plan) {
    const { id: docId, sku, name, stock_actual, qty_to_add, stock_proyectado, box_code, reports } = item;

    console.log(`\nProcesando ${sku} (${name}): Stock ${stock_actual} -> ${stock_proyectado} (+${qty_to_add} uds)`);

    // 1. Actualizar products
    const prodRef = doc(db, 'products', docId);
    const prodSnap = await getDoc(prodRef);
    const prodData = prodSnap.exists() ? prodSnap.data() : {};

    const updateFields = {
      STOCK: stock_proyectado,
      stock: stock_proyectado,
      updatedAt: new Date().toISOString()
    };

    if (box_code && !prodData.BOX_CODE && !prodData.box_code) {
      updateFields.BOX_CODE = box_code;
      updateFields.box_code = box_code;
    }

    await updateDoc(prodRef, updateFields);
    console.log(`  -> Firestore products/${docId} actualizado a stock ${stock_proyectado}`);

    // 2. Registrar en stock_movements
    const repTexts = (reports || []).map(r => `[${r.date}] ${r.text}`).slice(0, 3).join(' | ');
    const movData = {
      productId: docId,
      sku: sku,
      nombre: name,
      tipo: 'ingreso_daniel',
      stockAnterior: stock_actual,
      cantidad: qty_to_add,
      stockNuevo: stock_proyectado,
      usuario: 'Daniel (WhatsApp)',
      nota: `Despacho Faltante Daniel WhatsApp (+${qty_to_add} uds): ${repTexts}`,
      fechaHora: new Date().toLocaleString('es-CL'),
      fecha: new Date().toISOString().split('T')[0],
      fechaTs: Date.now()
    };
    await addDoc(collection(db, 'stock_movements'), movData);
    console.log(`  -> Movimiento 'ingreso_daniel' registrado en stock_movements (+${qty_to_add} uds)`);

    // 3. Actualizar o limpiar stock_pending
    const pendingRef = doc(db, 'stock_pending', sku);
    if (stock_proyectado >= 0) {
      await setDoc(pendingRef, {
        sku: sku,
        nombre: name,
        pendiente: 0,
        saldadaEn: new Date().toISOString(),
        nota: `Deuda saldada al 100% por despacho de Daniel (+${qty_to_add} uds)`
      }, { merge: true });
      console.log(`  -> stock_pending/${sku} SALDADA a 0`);
    } else {
      const nuevoPendiente = Math.abs(stock_proyectado);
      await setDoc(pendingRef, {
        sku: sku,
        nombre: name,
        pendiente: nuevoPendiente,
        updatedAt: new Date().toISOString(),
        nota: `Deuda reducida a ${nuevoPendiente} uds tras despacho de Daniel (+${qty_to_add} uds)`
      }, { merge: true });
      console.log(`  -> stock_pending/${sku} reducida a ${nuevoPendiente} uds`);
    }

    actualizados++;
  }

  console.log(`\n======================================================`);
  console.log(`¡CORRECCIÓN COMPLETADA CON ÉXITO! ${actualizados} productos actualizados en Firestore.`);
  console.log(`======================================================`);
}

applyPlan35().catch(console.error);
