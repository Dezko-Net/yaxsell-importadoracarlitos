const PROJECT_ID = 'asistoraerp';

async function getAccessToken() {
  const { execSync } = await import('child_process');
  return execSync('gcloud.cmd auth application-default print-access-token', {
    encoding: 'utf-8', timeout: 10000,
  }).trim();
}

async function queryMetric(token, metricName, days) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const filter = `metric.type="${metricName}" resource.type="firestore.googleapis.com/Database"`;
  const url = `https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${start.toISOString()}&interval.endTime=${now.toISOString()}&aggregation.alignmentPeriod=86400s&aggregation.perSeriesAligner=ALIGN_DELTA`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) return { daily: [], total: 0 };
  const data = await res.json();
  if (!data.timeSeries) return { daily: [], total: 0 };
  const dayMap = new Map();
  let total = 0;
  for (const ts of data.timeSeries) {
    for (const p of ts.points || []) {
      const val = Number(p.value?.int64Value || p.value?.doubleValue || 0);
      total += val;
      const dayKey = p.interval?.startTime?.slice(0, 10) || '';
      if (dayKey) dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + val);
    }
  }
  const daily = Array.from(dayMap.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  return { daily, total };
}

async function main() {
  const token = await getAccessToken();
  const metrics = [
    { name: 'firestore.googleapis.com/document/read_ops_count', label: 'LECTURAS' },
    { name: 'firestore.googleapis.com/document/write_ops_count', label: 'ESCRITURAS' },
    { name: 'firestore.googleapis.com/document/delete_ops_count', label: 'ELIMINACIONES' },
  ];
  
  for (const m of metrics) {
    console.log(`\n========== ${m.label} ==========`);
    const { daily, total } = await queryMetric(token, m.name, 7);
    if (daily.length === 0) { console.log('  Sin datos'); continue; }
    daily.forEach(d => console.log(`  ${d.date}: ${d.value.toLocaleString()}`));
    console.log(`  --- TOTAL 7 días: ${total.toLocaleString()}`);
    
    // Today and yesterday
    const today = daily[daily.length - 1];
    const yesterday = daily[daily.length - 2];
    console.log(`  >>> HOY (${today.date}): ${today.value.toLocaleString()}`);
    if (yesterday) console.log(`  >>> AYER (${yesterday.date}): ${yesterday.value.toLocaleString()}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
