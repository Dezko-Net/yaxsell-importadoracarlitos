import { NextResponse } from 'next/server';
import { reserveOrderCode } from '@/lib/order-identity';

export const dynamic = 'force-dynamic';

// Compatibilidad para clientes antiguos: el número entregado queda reservado
// mediante la misma transacción que usa el checkout actual.
export async function GET() {
  try {
    const reserved = await reserveOrderCode('ORD', 5);
    return NextResponse.json({ nextIndex: reserved.orderIndex, orderCode: reserved.orderCode }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error: any) {
    console.error('[orders/next-index GET]', error);
    return NextResponse.json({ error: error?.message || 'No se pudo reservar un número de pedido único.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const prefix = body?.prefix === 'WR' ? 'WR' : 'ORD';
    const reserved = await reserveOrderCode(prefix, prefix === 'WR' ? 8 : 5);
    return NextResponse.json({ nextIndex: reserved.orderIndex, orderCode: reserved.orderCode }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error: any) {
    console.error('[orders/next-index]', error);
    return NextResponse.json({ error: error?.message || 'No se pudo reservar un número de pedido único.' }, { status: 503 });
  }
}
