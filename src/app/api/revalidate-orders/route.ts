import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

export async function POST() {
  try {
    revalidateTag('orders');
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[revalidate-orders] Error:', error);
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }
}
