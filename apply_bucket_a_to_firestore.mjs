import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, setDoc, deleteDoc, collection, addDoc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const app = initializeApp({ apiKey: 'AIzaSyCm2i8lYz_e000VT8tZKdBVLtDQJngq_BQ', projectId: 'yaxselldemo' });
const db = getFirestore(app, 'donbalato');

const plan = JSON.parse(fs.readFileSync('C:/Proyectos/AUTOMATIZACIONES/clean_bucket_a_plan.json', 'utf8'));

async function applyCorrections() {
  console.log(`Iniciando aplicación de ${plan.length} correcciones en Firestore...`);

  let actualizados = 0;
  for (const item of plan) {
    const { id: docId, sku, name, stock_actual, qty_daniel, saldo_proyectado, boxCode, reportes } = item;

    console.log(`\nProcesando ${sku} (${name}): Stock ${stock_actual} -> ${saldo_proyectado} (+${qty_daniel} uds)`);

    // 1. Actualizar products
    const prodRef = doc(db, 'products', docId);
    const prodSnap = await getDoc(prodRef);
    const prodData = prodSnap.exists() ? prodSnap.data() : {};

    const updateFields = {
      STOCK: saldo_proyectado,
      stock: saldo_proyectado,
      updatedAt: new Date().toISOString()
    };

    if (boxCode && !prodData.BOX_CODE && !prodData.box_code) {
      updateFields.BOX_CODE = boxCode;
      updateFields.box_code = boxCode;
    }

    await updateDoc(prodRef, updateFields);
    console.log(`  -> Firestore products/${docId} actualizado a stock ${saldo_proyectado}`);

    // 2. Registrar en stock_movements
    const repTexts = reportes.map(r => `[${r.date}] ${r.full_text}`).join(' | ');
    const movData = {
      productId: docId,
      sku: sku,
      nombre: name,
      tipo: 'ingreso_daniel',
      stockAnterior: stock_actual,
      cantidad: qty_daniel,
      stockNuevo: saldo_proyectado,
      usuario: 'Daniel (WhatsApp)',
      nota: `Compensación Auditoría Daniel WhatsApp: ${repTexts}`,
      fechaHora: new Date().toLocaleString('es-CL'),
      fecha: new Date().toISOString().split('T')[0],
      fechaTs: Date.now()
    };
    await addDoc(collection(db, 'stock_movements'), movData);
    console.log(`  -> Movimiento 'ingreso_daniel' registrado en stock_movements (+${qty_daniel} uds)`);

    // 3. Actualizar o limpiar stock_pending
    const pendingRef = doc(db, 'stock_pending', sku);
    if (saldo_proyectado >= 0) {
      await setDoc(pendingRef, {
        sku: sku,
        nombre: name,
        pendiente: 0,
        saldadaEn: new Date().toISOString(),
        nota: `Deuda saldada al 100% por ingreso de Daniel (+${qty_daniel} uds)`
      }, { merge: true });
      console.log(`  -> stock_pending/${sku} SALDADA a 0`);
    } else {
      const nuevoPendiente = Math.abs(saldo_proyectado);
      await setDoc(pendingRef, {
        sku: sku,
        nombre: name,
        pendiente: nuevoPendiente,
        updatedAt: new Date().toISOString(),
        nota: `Deuda reducida a ${nuevoPendiente} uds tras ingreso parcial de Daniel (+${qty_daniel} uds)`
      }, { merge: true });
      console.log(`  -> stock_pending/${sku} reducida a ${nuevoPendiente} uds`);
    }

    actualizados++;
  }

  console.log(`\n======================================================`);
  console.log(`¡CORRECCIÓN COMPLETADA CON ÉXITO! ${actualizados} productos actualizados.`);
  console.log(`======================================================`);
}

applyCorrections().catch(console.error);
