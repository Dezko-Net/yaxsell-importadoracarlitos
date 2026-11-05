import { NextResponse } from 'next/server';
import { getReadsSummary, fetchPersistedDailyCountFromFirebase } from '@/lib/firebase-read-tracker';

export const dynamic = 'force-dynamic';

export async function GET() {
  const summary = getReadsSummary(1440); // full day (24 hours)

  if (summary.total === 0) {
    const persistedTotal = await fetchPersistedDailyCountFromFirebase();
    if (persistedTotal > 0) {
      summary.total = persistedTotal;
    }
  }

  return NextResponse.json(summary);
}
