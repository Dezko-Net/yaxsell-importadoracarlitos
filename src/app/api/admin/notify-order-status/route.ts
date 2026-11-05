import { NextRequest, NextResponse } from 'next/server';
import { notifyOrderStatusChange } from '@/services/notificationService';
import type { Order, OrderStatus } from '@/types/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { order, prevStatus, newStatus } = body as {
      order: Order;
      prevStatus: OrderStatus;
      newStatus: OrderStatus;
    };

    if (!order || !newStatus) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    await notifyOrderStatusChange(order, prevStatus, newStatus).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error' }, { status: 500 });
  }
}
