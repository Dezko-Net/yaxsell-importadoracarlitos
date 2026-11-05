// Monitorea lecturas en tiempo real cada 30 segundos
import { execSync } from 'child_process';

const PROJECT_ID = 'asistoraerp';

async function getAccessToken() {
  return execSync('gcloud.cmd auth application-default print-access-token', {
    encoding: 'utf-8', timeout: 10000,
  }).trim();
}

async function getReadsLastMinutes(token, minutes) {
  const now = new Date();
  const start = new Date(now.getTime() - minutes * 60 * 1000);
  const filter = 'metric.type="firestore.googleapis.com/document/read_ops_count" resource.type="firestore.googleapis.com/Database"';
  const url = `https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${start.toISOString()}&interval.endTime=${now.toISOString()}&aggregation.alignmentPeriod=60s&aggregation.perSeriesAligner=ALIGN_DELTA`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) return { total: -1, points: [] };
  const data = await res.json();
  if (!data.timeSeries) return { total: 0, points: [] };
  let total = 0;
  const points = [];
  for (const ts of data.timeSeries) {
    for (const p of ts.points || []) {
      const val = Number(p.value?.int64Value || p.value?.doubleValue || 0);
      total += val;
      points.push({ time: p.interval?.startTime?.slice(11, 19), val });
    }
  }
  return { total, points };
}

async function main() {
  const token = await getAccessToken();
  console.log('Monitoreando lecturas en tiempo real (Ctrl+C para parar)...');
  console.log('Hora actual:', new Date().toISOString());
  console.log('');
  
  let prevTotal = 0;
  for (let i = 0; i < 20; i++) {
    const { total, points } = await getReadsLastMinutes(token, 2);
    const diff = total - prevTotal;
    const timestamp = new Date().toISOString().slice(11, 19);
    if (i === 0) {
      console.log(`[${timestamp}] Lecturas en últimos 2min: ${total}`);
    } else {
      console.log(`[${timestamp}] Lecturas en últimos 2min: ${total} ${diff > 0 ? '⚠️ +' + diff + ' NUEVAS' : '✓ sin cambios'}`);
    }
    if (points.length > 0) {
      points.forEach(p => console.log(`           ${p.time} = ${p.val} lecturas`));
    }
    prevTotal = total;
    await new Promise(r => setTimeout(r, 30000)); // 30 segundos
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
