import { AI_CATEGORIZE_ENABLED } from '@/lib/feature-flags';

import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAuthHeaders, buildGeminiUrl } from '@/lib/google-auth';

import { GEMINI_TEXT_MODELS as MODELS } from '@/lib/gemini-models';

export async function POST(req: NextRequest) {
  if (!AI_CATEGORIZE_ENABLED) return NextResponse.json({ error: 'IA desactivada' }, { status: 404 });
  try {
    const { products, categories, subcategories } = await req.json();

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: 'No products provided' }, { status: 400 });
    }

    // Prepare system instructions and contextual lists
    const categoriesList = categories.map((c: any) => `- ID: "${c.$id}", Nombre: "${c.name}"`).join('\n');
    const subcategoriesList = subcategories.map((s: any) => `- ID: "${s.$id}", Nombre: "${s.name}", Categoría Padre ID: "${s.categoryId}"`).join('\n');

    const productsList = products.map((p: any) => `* ID: "${p.$id}", Nombre: "${p.NAME || p.name}", Descripción: "${p.DESCRIPTION || p.description || ''}"`).join('\n\n');

    const systemPrompt = `Eres Yaxbot, la IA experta en categorización de productos de e-commerce de Yaxsel.
Tu misión es clasificar una lista de productos asignándoles la categoría y la subcategoría más coherente basándote ÚNICAMENTE en las listas provistas.

## CATEGORÍAS DISPONIBLES:
${categoriesList || 'Ninguna registrada'}

## SUBCATEGORÍAS DISPONIBLES:
${subcategoriesList || 'Ninguna registrada'}

## INSTRUCCIONES DE CATEGORIZACIÓN:
1. Analiza el nombre y descripción de cada producto.
2. Identifica la categoría más coherente. Asigna el "ID" exacto de la categoría (no inventes IDs, usa uno de la lista).
3. Identifica la subcategoría más coherente que pertenezca a esa categoría seleccionada. Asigna el "ID" exacto de la subcategoría (asegúrate de que el "Categoría Padre ID" de la subcategoría coincida con el ID de la categoría que asignaste).
4. Si un producto no encaja claramente en ninguna categoría existente, asígnale la que tenga mayor relación. Si es totalmente imposible, deja "categoryId": null y "subcategoryId": null.
5. Si no hay subcategorías apropiadas bajo la categoría asignada, deja "subcategoryId": null.

## FORMATO DE RESPUESTA REQUERIDO:
Debes devolver una lista JSON de objetos en este formato exacto, sin comentarios, sin markdown de bloques de código (\`\`\`json ... \`\`\`), solo el JSON puro para que pueda ser parseado directamente:
[
  {
    "productId": "id-del-producto",
    "categoryId": "id-de-la-categoria-sugerida-o-null",
    "subcategoryId": "id-de-la-subcategoria-sugerida-o-null",
    "reason": "Breve explicación de 1 línea de por qué se clasificó así"
  }
]`;

    const body = {
      contents: [{
        role: 'user',
        parts: [
          { text: systemPrompt },
          { text: `POR FAVOR CLASIFICA LOS SIGUIENTES PRODUCTOS:\n\n${productsList}` }
        ]
      }],
      generationConfig: {
        temperature: 0.1, // Baja temperatura para consistencia y precisión
        responseMimeType: "application/json"
      }
    };

    let res;
    let lastError = '';
    const geminiHeaders = await getGeminiAuthHeaders();
    for (const model of MODELS) {
      const url = buildGeminiUrl(model);
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: geminiHeaders,
          body: JSON.stringify(body),
        });
        if (res.ok) break;
        lastError = await res.text();
      } catch (e: any) {
        lastError = e.message;
      }
    }

    if (!res || !res.ok) {
      return NextResponse.json({ error: `AI classification failed: ${lastError}` }, { status: res?.status || 503 });
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    
    // Parse the suggested classification list
    try {
      const suggestions = JSON.parse(rawText.trim());
      return NextResponse.json({ success: true, suggestions });
    } catch (parseErr) {
      console.error('Failed to parse suggestions JSON:', rawText);
      return NextResponse.json({ success: false, error: 'Could not parse suggestions as JSON', rawText });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
