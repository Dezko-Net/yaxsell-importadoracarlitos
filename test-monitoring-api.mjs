// Test: consultar métricas REALES de Firestore desde Cloud Monitoring API
const PROJECT_ID = 'asistoraerp';

async function getAccessToken() {
  const { execSync } = await import('child_process');
  return execSync('gcloud.cmd auth application-default print-access-token', {
    encoding: 'utf-8',
    timeout: 10000,
  }).trim();
}

async function queryMetric(token, metricName, hours = 24) {
  const url = `https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries:query`;
  
  // MQL query: fetch the metric, align as delta per hour, within time range
  const mql = `fetch firestore.googleapis.com/Database | metric '${metricName}' | within ${hours}h | align DELTA(1h) | every 1h`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: mql }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 300)}`);
  }

  return await res.json();
}

async function queryMetricList(token, metricName, hours = 24) {
  // Alternative: use timeSeries.list REST API (simpler)
  const now = new Date();
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
  
  const filter = `metric.type="${metricName}" resource.type="firestore.googleapis.com/Database"`;
  const url = `https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${start.toISOString()}&interval.endTime=${now.toISOString()}&aggregation.alignmentPeriod=3600s&aggregation.perSeriesAligner=ALIGN_DELTA`;
  
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 500)}`);
  }

  return await res.json();
}

async function main() {
  console.log('Obteniendo access token...');
  const token = await getAccessToken();
  console.log('Token OK\n');
  
  const metrics = [
    { name: 'firestore.googleapis.com/document/read_ops_count', label: 'Lecturas' },
    { name: 'firestore.googleapis.com/document/write_ops_count', label: 'Escrituras' },
    { name: 'firestore.googleapis.com/document/delete_ops_count', label: 'Eliminaciones' },
  ];
  
  for (const m of metrics) {
    console.log(`=== ${m.label} (${m.name}) ===`);
    try {
      const data = await queryMetricList(token, m.name, 24);
      if (data.timeSeries && data.timeSeries.length > 0) {
        let total = 0;
        data.timeSeries.forEach(ts => {
          console.log(`  Series: metric=${ts.metric.type}`);
          ts.points?.forEach(p => {
            const val = Number(p.value?.int64Value || p.value?.doubleValue || 0);
            total += val;
          });
        });
        console.log(`  TOTAL 24h: ${total}`);
      } else {
        console.log('  No data (sin lecturas en 24h o sin series)');
      }
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
    }
    console.log('');
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
