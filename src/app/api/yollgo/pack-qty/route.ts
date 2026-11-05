import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'scripts', 'yollgo-products.json');
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'No se encontró el archivo de datos de Yollgo. Ejecuta el scraper primero.' }, { status: 404 });
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    if (!data.products || !Array.isArray(data.products)) {
      return NextResponse.json({ error: 'Formato inválido' }, { status: 500 });
    }

    // Construir mapeo SKU (usercode) → baozhuangshu (cantidad por paquete)
    const mapping: Record<string, { packQty: number; boxQty: number; name: string }> = {};
    
    for (const p of data.products) {
      const sku = (p.usercode || '').trim().toUpperCase();
      const packQty = parseInt(p.baozhuangshu, 10);
      const boxQty = parseInt(p.zhuangxiangshu, 10);
      
      if (sku && !isNaN(packQty) && packQty > 0) {
        // Si hay duplicados, quedarse con el primero
        if (!mapping[sku]) {
          mapping[sku] = { 
            packQty, 
            boxQty: !isNaN(boxQty) ? boxQty : 0,
            name: p.namees || p.namecn || '',
          };
        }
      }
    }

    return NextResponse.json({
      total: data.products.length,
      mapped: Object.keys(mapping).length,
      mapping,
      scrapedAt: data.scrapedAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
