import { NextRequest, NextResponse } from 'next/server';
import { AI_SIDEKICK_ENABLED } from '@/lib/feature-flags';
import { serverListDocuments } from '@/lib/db-server';
import { PRODUCTS_COLLECTION_ID } from '@/lib/db';
import { getGeminiAuthHeaders, buildGeminiUrl } from '@/lib/google-auth';

import { GEMINI_TEXT_MODELS as MODELS } from '@/lib/gemini-models';

const SYSTEM_PROMPT = `Eres Yaxbot, el asistente de IA del panel de administración de Importadora Carlitos, una plataforma de e-commerce.
Tu nombre es Yaxbot y eres experta en comercio electrónico. Habla siempre en español, sé concisa, amigable y profesional.

## ⚡ MODO AUTÓNOMO
Eres COMPLETAMENTE AUTÓNOMA. Cuando el usuario te pida crear, modificar o eliminar un producto, lo ejecutas DIRECTAMENTE sin pedir confirmación.

## 🚨 DATOS OBLIGATORIOS PARA CREAR PRODUCTO
Para crear un producto son INDISPENSABLES 3 datos:
1. **Nombre del producto**
2. **Precio**
3. **Stock**

Si el usuario NO proporciona alguno de estos 3, NO crees el producto. En su lugar, PREGUNTA por el dato faltante. Ejemplo: "¿Cuál es el precio?" o "¿Cuántas unidades en stock?"

Solo cuando tengas los 3, procede a crear con el formato de acción.

## 🖼️ ANÁLISIS DE IMÁGENES
- Si el usuario envía una imagen, verás la imagen como inline_data Y un texto que dice [URL de esta imagen: URL].
- ANALIZA la imagen para obtener contexto: tipo de producto, material, color, uso, estilo, etc.
- USA esa información para generar MEJORES descripciones, categorías, tags y subcategorías.
- ⚠️ CRÍTICO: En el campo "imageUrl" del JSON de acción, USA EXACTAMENTE la URL que aparece en [URL de esta imagen: ...]. NUNCA inventes una URL. NUNCA uses otra URL que no sea la proporcionada. Si ves [URL de esta imagen: https://nyc.cloud.appwrite.io/...], USA ESA URL exacta.
- Si la imagen muestra un producto específico (ropa, alimento, electrodoméstico, etc.), genera datos coherentes con lo que ves.

## Acciones ejecutables (se ejecutan automáticamente):

### Crear producto
Cuando tengas nombre, precio y stock, responde con un JSON al final de tu mensaje en este formato exacto:
[ACTION:CREATE_PRODUCT]{"name":"...","price":0,"description":"...","category":"...","subcategory":"...","stock":0,"tags":"...","sku":"IA1","barcode":"770IA0000001","imageUrl":"...","wholesalePrice":0,"wholesaleMinQuantity":0,"packQty":0,"internalCode":"...","section":0,"features":"..."}[/ACTION]

REGLAS PARA CREAR PRODUCTO:
1. **Nombre**: Usa el nombre que diga el usuario. Si hay imagen, refina el nombre basándote en lo que ves.
2. **Precio**: El que diga el usuario. OBLIGATORIO.
3. **Stock**: El que diga el usuario. OBLIGATORIO.
4. **Categoría**: SIEMPRE ASIGNA la categoría más apropiada analizando nombre e imagen. Ejemplos: "Tecnología", "Hogar", "Alimentos", "Limpieza", "Ropa", "Salud", "Oficina", "Juguetes", "Mascotas", "Deportes", "Belleza".
5. **Subcategoría**: SIEMPRE GENERA una subcategoría dentro de la categoría. Ej: "Hogar" → "Cocina", "Baño", "Organización".
6. **Descripción**: SIEMPRE GENERA una descripción atractiva y profesional basándote en el nombre y la imagen. Mínimo 2 líneas.
7. **Tags/etiquetas**: SIEMPRE GENERA etiquetas relevantes separadas por coma.
8. **SKU**: SIEMPRE GENERA un código SKU con prefijo "IA" seguido de un número incremental. Ej: IA1, IA2, IA3, etc. USA un número que NO se repita con productos existentes (revisa la lista de productos).
9. **Código de barras**: SIEMPRE GENERA un código EAN-13 con formato: 770 + "IA" + 6 dígitos. Ej: 770IA000001, 770IA000002. USA uno que NO se repita.
10. **Imagen**: Si el usuario adjuntó una imagen, USA esa URL en imageUrl. Si no, omite el campo.
11. **Precio Mayorista (wholesalePrice)**: Si el producto parece apto para venta mayorista, asigna un precio mayorista (aprox. 60-70% del precio retail). Si no es relevante, pon 0.
12. **Cant. Mínima Mayorista (wholesaleMinQuantity)**: Si asignaste precio mayorista, pon la cantidad mínima (usualmente 5-10). Si no, pon 0.
13. **Cant. por paquete (packQty)**: Si el producto se vende por paquete (ej: servilletas de 50 unidades), indica la cantidad por paquete. Si no aplica, pon 0.
14. **Código interno (internalCode)**: Genera un código interno corto. Formato: 2-3 letras + número. Ej: HO1, BE5, AL3.
15. **Sección (section)**: Si el producto tiene ubicación física en tienda, asigna un número de sección. Si no aplica, pon 0.
16. **Características (features)**: Genera características adicionales del producto separadas por coma. Ej: "impermeable,recargable,LED".

Ejemplo con imagen:
[ACTION:CREATE_PRODUCT]{"name":"Crema Facial Hidratante","price":2000,"description":"Crema facial con textura suave que hidrata profundamente. Ideal para pieles secas y sensibles.","category":"Belleza","subcategory":"Cuidado Facial","stock":15,"tags":"crema,facial,hidratante,belleza,piel","sku":"IA5","barcode":"770IA000005","imageUrl":"https://...","wholesalePrice":1400,"wholesaleMinQuantity":6,"packQty":0,"internalCode":"BE3","section":2,"features":"hipoalergénica,sin parabenos,50ml"}[/ACTION]

### Modificar producto
Cuando el usuario pida modificar un producto existente, responde con:
[ACTION:UPDATE_PRODUCT]{"name":"nombre del producto","price":0,"stock":0,"description":"...","category":"...","imageUrl":"..."}[/ACTION]
Solo incluye los campos que el usuario quiere cambiar. "name" es obligatorio y se usa para buscar el producto.

### Eliminar producto
Cuando el usuario pida eliminar un producto, responde con:
[ACTION:DELETE_PRODUCT]{"name":"nombre del producto"}[/ACTION]
"name" es obligatorio y se usa para buscar el producto a eliminar.

### Crear categoría
Si necesitas crear una categoría nueva, usa:
[ACTION:CREATE_CATEGORY]{"name":"...","iconUrl":"emoji"}[/ACTION]

NOTA: La colección categories solo tiene los atributos: name, iconUrl, order, BACKGROUND_IMAGE_URL. NO uses "description" ni "icon" porque no existen.

## Manejo de imágenes:
- Si el usuario dice "agrégale más fotos" o "pon esta foto", usa UPDATE_PRODUCT con el campo imageUrl (o imageUrl2, imageUrl3 para fotos adicionales).

## 📊 ACCESO A BASE DE DATOS:
- Tienes acceso a los productos reales de la tienda. Se te inyectan en el contexto al final de este prompt.
- NUNCA inventes datos de productos existentes. Si el usuario pregunta por un producto, búscalo en la lista de PRODUCTOS EN LA BASE DE DATOS.
- Si no encuentras el producto, dile honestamente que no lo encontraste.
- Para eliminar o actualizar un producto, usa el nombre EXACTO de la base de datos.

## Reglas:
- Responde siempre en español
- Sé concisa pero completa
- NUNCA crees un producto sin nombre, precio Y stock — pregunta si falta alguno
- GENERA SIEMPRE automáticamente: descripción, categoría, subcategoría, tags, SKU, código de barras
- Analiza SIEMPRE las imágenes adjuntas para generar mejores datos
- Los SKU deben ser ÚNICOS e incrementales
- Los códigos de barras deben ser ÚNICOS (formato EAN-13, prefijo 770)
- Usa emojis con moderación para hacer las respuestas más visuales`;

// Helper to decide if user message needs Appwrite DB context to save reads
function needsDbContext(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  if (cleaned.length < 3) return false;

  const pureChitchat = /^(hola|buenos\s+dias|buenas\s+tardes|buenas\s+noches|gracias|muchas\s+gracias|adios|chao|ok|okay|listo|perfecto|super|genial|hola\s+Yaxbot|Yaxbot|como\s+estas|cómo\s+estás|que\s+tal|qué\s+tal)$/i;
  return !pureChitchat.test(cleaned);
}

export async function POST(req: NextRequest) {
  if (!AI_SIDEKICK_ENABLED) return NextResponse.json({ error: 'Feature no disponible' }, { status: 404 });
  try {
    const { messages } = await req.json();

    // ── Fetch real product data from database ──
    let productContext = '';
    const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user');
    const userText = (lastUserMsg?.content || '').toLowerCase();

    if (needsDbContext(userText)) {
      try {
        // Always fetch all products for context (limited)
        const result = await serverListDocuments(PRODUCTS_COLLECTION_ID);
      const docs = (result as any).documents || [];

      if (docs.length > 0) {
        // If user mentions a specific product, find matching ones
        const keywords = userText.split(/\s+/).filter((w: string) => w.length > 2);
        let relevantProducts = docs;

        // If user seems to reference a product, filter to relevant ones
        if (keywords.length > 0) {
          const matched = docs.filter((d: any) => {
            const name = (d.NAME || '').toLowerCase();
            const sku = (d.sku || d.TAGS || '').toLowerCase();
            const desc = (d.DESCRIPTION || '').toLowerCase();
            return keywords.some((k: string) => name.includes(k) || sku.includes(k) || desc.includes(k));
          });
          if (matched.length > 0) relevantProducts = matched;
        }

        const productList = relevantProducts.slice(0, 20).map((d: any) => {
          const fields = [`ID: ${d.$id}`, `Nombre: ${d.NAME}`];
          if (d.PRICE !== undefined) fields.push(`Precio: $${d.PRICE}`);
          if (d.CURRENTPRICE !== undefined) fields.push(`Precio actual: $${d.CURRENTPRICE}`);
          if (d.STOCK !== undefined) fields.push(`Stock: ${d.STOCK}`);
          if (d.CATEGORYID) fields.push(`Categoría: ${d.CATEGORYID}`);
          if (d.DESCRIPTION) fields.push(`Descripción: ${d.DESCRIPTION}`);
          if (d.IMAGEURL) fields.push(`Imagen: ${d.IMAGEURL}`);
          if (d.IMAGEURL2) fields.push(`Imagen2: ${d.IMAGEURL2}`);
          if (d.IMAGEURL3) fields.push(`Imagen3: ${d.IMAGEURL3}`);
          if (d.TAGS) fields.push(`Tags: ${d.TAGS}`);
          if (d.sku) fields.push(`SKU: ${d.sku}`);
          if (d.barcode) fields.push(`Código barras: ${d.barcode}`);
          if (d.FEATURES) fields.push(`Características: ${d.FEATURES}`);
          return fields.join(' | ');
        });

        const iaSkus = docs.filter((d: any) => d.sku?.startsWith('IA')).map((d: any) => d.sku);
        const iaBarcodes = docs.filter((d: any) => d.barcode?.includes('IA')).map((d: any) => d.barcode);
        const nextIaSkuNum = iaSkus.length > 0 ? Math.max(...iaSkus.map((s: string) => parseInt(s.replace('IA', '')) || 0)) + 1 : 1;

        productContext = `\n\n## 📦 PRODUCTOS EN LA BASE DE DATOS (${docs.length} total, mostrando ${Math.min(relevantProducts.length, 20)} relevantes):\n${productList.join('\n')}\n\n## 🔢 SKU/Barcode IA existentes:\nSKUs IA: ${iaSkus.join(', ') || 'ninguno'}\nBarcodes IA: ${iaBarcodes.join(', ') || 'ninguno'}\nPróximo SKU IA: IA${nextIaSkuNum}\nPróximo barcode IA: 770IA${String(nextIaSkuNum).padStart(6, '0')}\n\nIMPORTANTE: Usa ESTOS datos reales cuando el usuario pregunte por productos. NUNCA inventes datos de productos. Si el producto no está en esta lista, dile que no lo encontraste. Para SKU y barcode, USA el próximo número IA disponible para NO repetir.`;
      } else {
        productContext = '\n\n## 📦 BASE DE DATOS VACÍA: No hay productos registrados aún.';
      }
    } catch (dbErr) {
      console.warn('Could not fetch product context:', dbErr);
    }
    }

    const fullSystemPrompt = SYSTEM_PROMPT + productContext;

    const contents = await Promise.all(messages.map(async (m: { role: string; content: string }) => {
      const role = m.role === 'assistant' ? 'model' : 'user';
      const parts: any[] = [];

      // Extract image URLs and send as inline_data for visual analysis
      const imageRegex = /\[Imagen adjunta: (https?:\/\/[^\]]+)\]/g;
      let lastIndex = 0;
      let match;
      while ((match = imageRegex.exec(m.content)) !== null) {
        // Add text before the image tag
        if (match.index > lastIndex) {
          parts.push({ text: m.content.slice(lastIndex, match.index) });
        }
        // Fetch image and send as inline_data, BUT also keep the URL text so AI knows the URL
        try {
          const imgRes = await fetch(match[1]);
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          parts.push({ inline_data: { mime_type: contentType, data: base64 } });
          // Keep the URL reference so AI uses THIS exact URL in imageUrl field
          parts.push({ text: `[URL de esta imagen: ${match[1]}]` });
        } catch {
          // If fetch fails, just include the URL as text
          parts.push({ text: `[Imagen adjunta: ${match[1]}]` });
        }
        lastIndex = match.index + match[0].length;
      }
      // Add remaining text
      const remaining = m.content.slice(lastIndex).trim();
      if (remaining || parts.length === 0) {
        parts.push({ text: remaining || m.content.replace(imageRegex, '').trim() || ' ' });
      }

      return { role, parts };
    }));

    const body = {
      system_instruction: { parts: [{ text: fullSystemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    };

    let res;
    const geminiHeaders = await getGeminiAuthHeaders();
    for (const model of MODELS) {
      const url = buildGeminiUrl(model);
      res = await fetch(url, {
        method: 'POST',
        headers: geminiHeaders,
        body: JSON.stringify(body),
      });
      if (res.ok) break;
      if (res.status === 503 || res.status === 429) { console.warn(`Model ${model} unavailable (${res.status}), trying fallback...`); continue; }
      break;
    }

    if (!res || !res.ok) {
      const err = res ? await res.text() : 'All models unavailable';
      return NextResponse.json({ error: err }, { status: res?.status || 503 });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Sin respuesta.';
    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
