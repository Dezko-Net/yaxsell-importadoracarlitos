/**
 * Firebase Read Tracker — Persistent server-side read tracker.
 * Tracks which API route/component originated each Firestore call.
 * Syncs daily reads to Firestore 'sequences' collection so cold starts never reset the counter.
 */

export interface ReadEntry {
  ts: number;
  op: 'list' | 'get' | 'update' | 'create' | 'delete';
  collectionId: string;
  detail: string;
  source: string;
  sourceFile: string;
  sourceLine: number;
  path: string;
}

const MAX_ENTRIES = 5000;

function getFs() {
  if (typeof window !== 'undefined') return null;
  try {
    return eval('require')('fs');
  } catch {
    return null;
  }
}

function getStoragePath(): string | null {
  if (typeof window !== 'undefined') return null;
  try {
    const p = eval('require')('path');
    return p.join(process.cwd(), '.firebase-tracker-log.json');
  } catch {
    return null;
  }
}

const globalForTracker = globalThis as unknown as {
  firebaseTrackerEntries?: ReadEntry[];
  firebasePersistedCount?: number;
  firebaseTrackerSaveTimer?: ReturnType<typeof setTimeout> | null;
};

function loadEntries(): ReadEntry[] {
  if (globalForTracker.firebaseTrackerEntries && globalForTracker.firebaseTrackerEntries.length > 0) {
    return globalForTracker.firebaseTrackerEntries;
  }
  const fsLib = getFs();
  const filePath = getStoragePath();
  if (fsLib && filePath) {
    try {
      if (fsLib.existsSync(filePath)) {
        const raw = fsLib.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          globalForTracker.firebaseTrackerEntries = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignore file read errors
    }
  }
  const initial: ReadEntry[] = [];
  globalForTracker.firebaseTrackerEntries = initial;
  return initial;
}

const entries: ReadEntry[] = loadEntries();

function flushEntriesToDisk() {
  globalForTracker.firebaseTrackerSaveTimer = null;
  const fsLib = getFs();
  const filePath = getStoragePath();
  if (fsLib && filePath) {
    try {
      const payload = JSON.stringify(entries.slice(-MAX_ENTRIES));
      if (typeof fsLib.writeFile === 'function') {
        fsLib.writeFile(filePath, payload, 'utf-8', () => {});
      } else {
        fsLib.writeFileSync(filePath, payload, 'utf-8');
      }
    } catch {
      // Ignore file write errors
    }
  }
}

function saveEntriesToDisk() {
  if (typeof window !== 'undefined') return;
  if (globalForTracker.firebaseTrackerSaveTimer) return;
  const timer = setTimeout(flushEntriesToDisk, 1500);
  if (timer && typeof (timer as any).unref === 'function') {
    (timer as any).unref();
  }
  globalForTracker.firebaseTrackerSaveTimer = timer;
}

let lastSyncTime = 0;
export async function syncDailyUsageToFirebase(_count: number): Promise<void> {
  // DESACTIVADO — las métricas reales vienen de Cloud Monitoring API
  // Esta función ya no usa el client SDK de Firebase (gRPC) que causaba
  // conexiones fantasma y lecturas/escrituras constantes
  return;
}

export async function fetchPersistedDailyCountFromFirebase(): Promise<number> {
  // DESACTIVADO — las métricas reales vienen de Cloud Monitoring API
  return 0;
}

// Alias for backward compatibility
export const fetchPersistedDailyCountFromAppwrite = fetchPersistedDailyCountFromFirebase;

export function getRecentReads(limit = 500): ReadEntry[] {
  return entries.slice(-limit);
}

export function getReadsSummary(minutes = 1440): {
  bySource: { source: string; count: number; collections: string[]; ops: Record<string, number> }[];
  byCollection: { collectionId: string; count: number; sources: string[]; ops: Record<string, number> }[];
  bySourceFile: { file: string; line: number; count: number; source: string }[];
  byMinute: { minute: string; count: number }[];
  crossRef: { source: string; collection: string; count: number }[];
  recent: { ts: number; op: string; collection: string; source: string; file: string; line: number }[];
  total: number;
  ops: Record<string, number>;
} {
  const cutoff = Date.now() - minutes * 60 * 1000;
  const recent = entries.filter((e) => e.ts >= cutoff);

  const sourceMap = new Map<string, { count: number; collections: Set<string>; ops: Record<string, number> }>();
  const colMap = new Map<string, { count: number; sources: Set<string>; ops: Record<string, number> }>();
  const fileMap = new Map<string, { file: string; line: number; count: number; source: string }>();
  const minuteMap = new Map<string, number>();
  const crossMap = new Map<string, { source: string; collection: string; count: number }>();
  const ops: Record<string, number> = {};

  for (const e of recent) {
    const s = sourceMap.get(e.source) || { count: 0, collections: new Set(), ops: {} };
    s.count++;
    s.collections.add(e.collectionId);
    s.ops[e.op] = (s.ops[e.op] || 0) + 1;
    sourceMap.set(e.source, s);

    const c = colMap.get(e.collectionId) || { count: 0, sources: new Set(), ops: {} };
    c.count++;
    c.sources.add(e.source);
    c.ops[e.op] = (c.ops[e.op] || 0) + 1;
    colMap.set(e.collectionId, c);

    const fileKey = `${e.sourceFile}:${e.sourceLine}`;
    const f = fileMap.get(fileKey) || { file: e.sourceFile, line: e.sourceLine, count: 0, source: e.source };
    f.count++;
    fileMap.set(fileKey, f);

    const d = new Date(e.ts);
    const minuteKey = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    minuteMap.set(minuteKey, (minuteMap.get(minuteKey) || 0) + 1);

    const crossKey = `${e.source}|||${e.collectionId}`;
    const cr = crossMap.get(crossKey) || { source: e.source, collection: e.collectionId, count: 0 };
    cr.count++;
    crossMap.set(crossKey, cr);

    ops[e.op] = (ops[e.op] || 0) + 1;
  }

  const bySource = Array.from(sourceMap.entries())
    .map(([source, data]) => ({ source, count: data.count, collections: Array.from(data.collections), ops: data.ops }))
    .sort((a, b) => b.count - a.count);

  const byCollection = Array.from(colMap.entries())
    .map(([collectionId, data]) => ({ collectionId, count: data.count, sources: Array.from(data.sources), ops: data.ops }))
    .sort((a, b) => b.count - a.count);

  const bySourceFile = Array.from(fileMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const byMinute = Array.from(minuteMap.entries())
    .map(([minute, count]) => ({ minute, count }))
    .sort((a, b) => a.minute.localeCompare(b.minute))
    .slice(-30);

  const crossRef = Array.from(crossMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  const recentList = recent.slice(-50).reverse().map(e => ({
    ts: e.ts,
    op: e.op,
    collection: e.collectionId,
    source: e.source,
    file: e.sourceFile,
    line: e.sourceLine,
  }));

  return { bySource, byCollection, bySourceFile, byMinute, crossRef, recent: recentList, total: recent.length, ops };
}

export function trackReadsBatch(op: string, collectionId: string, count: number, detail: string, stack: string): void {
  try {
    const safeCount = Math.max(1, Math.floor(Number(count) || 1));
    const lines = (stack || '').split('\n').slice(2);
    const frame =
      lines.find((l) => /[\\/](app|pages|lib|services|hooks|components|templates)[\\/]/.test(l) && !/firebase-(server|read-tracker|tracker)/.test(l) && !/db\.ts/.test(l)) ||
      lines[0] ||
      '';
    const pathMatch = frame.match(/[\\/](src[\\/].+?\.tsx?):(\d+):/);
    const path = pathMatch ? pathMatch[1] : frame.trim();
    const lineMatch = frame.match(/:(\d+):/);
    const lineNum = lineMatch ? parseInt(lineMatch[1], 10) : 0;

    let source = 'unknown';
    let sourceFile = path;
    const routeMatch = frame.match(/[\\/](api[\\/][^\\/]+(?:[\\/][^\\/]+)*)[\\/]route\.ts/);
    if (routeMatch) {
      source = '/' + routeMatch[1].replace(/\\/g, '/');
    } else {
      const componentMatch = frame.match(/[\\/](components|templates|app|hooks)[\\/]([^\\/]+)\./);
      if (componentMatch) {
        source = componentMatch[1] + '/' + componentMatch[2];
      } else {
        source = path;
      }
    }

    const fileNameMatch = path.match(/[\\/]([^\\/]+\.tsx?)$/);
    if (fileNameMatch) {
      sourceFile = fileNameMatch[1];
    }

    const ts = Date.now();
    const trimmedDetail = detail.slice(0, 200);
    for (let i = 0; i < safeCount; i++) {
      entries.push({
        ts,
        op: op as any,
        collectionId,
        detail: trimmedDetail,
        source,
        sourceFile,
        sourceLine: lineNum,
        path,
      });
    }
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
    saveEntriesToDisk();
  } catch {
    // never throw from tracker
  }
}

export function trackRead(op: string, collectionId: string, detail: string, stack: string): void {
  trackReadsBatch(op, collectionId, 1, detail, stack);
}
