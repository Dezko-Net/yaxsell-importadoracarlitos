import { NextRequest, NextResponse } from 'next/server';
import { getHeaders, getServerConfig, serverListDocuments } from '@/lib/db-server';

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const { endpoint, databaseId } = getServerConfig();
    const headers = getHeaders();

    // 1. Fetch the blocked product to get its SKU
    const blockedRes = await fetch(
      `${endpoint}/databases/${databaseId}/collections/blocked_products/documents/${id}`,
      { headers }
    );
    if (!blockedRes.ok) {
      const err = await blockedRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as { message?: string }).message || `Fetch blocked product failed: ${blockedRes.status}` },
        { status: blockedRes.status }
      );
    }
    const blockedDoc = await blockedRes.json();
    const sku = blockedDoc.sku || '';

    // 2. Delete from blocked_products
    const deleteRes = await fetch(
      `${endpoint}/databases/${databaseId}/collections/blocked_products/documents/${id}`,
      { method: 'DELETE', headers }
    );
    if (!deleteRes.ok) {
      const err = await deleteRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as { message?: string }).message || `Delete blocked failed: ${deleteRes.status}` },
        { status: deleteRes.status }
      );
    }

    // 3. Find and delete the product from products collection by SKU
    if (sku) {
      try {
        const qSku = JSON.stringify({ method: 'equal', attribute: 'sku', values: [sku] });
        const qLimit = JSON.stringify({ method: 'limit', values: [5] });
        const productsRes = await serverListDocuments('products', [qSku, qLimit]);
        for (const prod of productsRes.documents) {
          await fetch(
            `${endpoint}/databases/${databaseId}/collections/products/documents/${prod.$id}`,
            { method: 'DELETE', headers }
          );
        }
      } catch (e) {
        console.warn('[blocked-products] Error deleting product from products collection:', e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
