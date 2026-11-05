type GeminiOptions = {
  imageUrls?: string[];
};

export interface ProductAiPack {
  titles: string[];
  selectedTitle: string;
  description: string;
  details: string;
  usage: string;
  ingredients: string;
  tags: string[];
  suggestedCategory: string;
  suggestedSubcategory: string;
}

function cleanJsonBlock(text: string) {
  return text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

async function callGemini(prompt: string, options?: GeminiOptions): Promise<string> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, imageUrls: options?.imageUrls || [] }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error en la API de Gemini' }));
    throw new Error(err.error || 'Error en la API de Gemini');
  }

  const data = await res.json();
  return data.text || '';
}

export async function generateProductTitle(
  description: string,
  category: string,
  imageUrls: string[] = [],
  currentName = ''
): Promise<string[]> {
  const prompt = `Eres un experto en e-commerce y marketing digital en Chile.
Genera 5 títulos de producto atractivos, concisos (máx 60 caracteres cada uno) y optimizados para SEO.

Categoría: ${category || 'General'}
Nombre actual: ${currentName || 'Sin nombre'}
Descripción actual: ${description || 'Sin descripción'}
${imageUrls.length > 0 ? `Analiza primero las imágenes del producto y usa lo visual como fuente principal de verdad.` : ''}

Reglas:
- Cada título en una línea nueva
- Sin numeración ni viñetas
- En español chileno
- Incluye palabras clave relevantes
- No uses comillas

Responde SOLO con los 5 títulos, uno por línea.`;

  const response = await callGemini(prompt, { imageUrls });
  return response.split('\n').map(t => t.trim()).filter(t => t.length > 3 && t.length < 100).slice(0, 5);
}

export async function generateProductDescription(
  name: string,
  category: string,
  currentDesc: string,
  imageUrls: string[] = []
): Promise<string> {
  const prompt = `Eres un copywriter experto en e-commerce en Chile.
Genera una descripción de producto atractiva y persuasiva.

Producto: ${name}
Categoría: ${category || 'General'}
${currentDesc ? `Descripción actual: ${currentDesc}` : ''}
${imageUrls.length > 0 ? 'Antes de escribir, analiza las imágenes del producto y combínalas con el título y el contexto textual.' : ''}

Reglas:
- Máximo 3 párrafos cortos (total ~100-150 palabras)
- Destaca beneficios, no solo características
- Usa español neutro/chileno
- No uses markdown, solo texto plano
- Incluye un llamado a la acción sutil al final

Responde SOLO con la descripción.`;

  return await callGemini(prompt, { imageUrls });
}

export async function generateProductTags(name: string, description: string, category: string): Promise<string[]> {
  const prompt = `Genera 8 tags/etiquetas para este producto de e-commerce:
Nombre: ${name}
Categoría: ${category || 'General'}
Descripción: ${description || 'Sin descripción'}

Reglas:
- Una etiqueta por línea
- Máximo 2-3 palabras cada una
- En español
- Sin hashtags ni símbolos
- Relevantes para búsqueda

Responde SOLO con las etiquetas, una por línea.`;

  const response = await callGemini(prompt);
  return response.split('\n').map(t => t.trim()).filter(t => t.length > 1 && t.length < 40).slice(0, 8);
}

export async function generateProductAiPack(params: {
  name?: string;
  description?: string;
  category?: string;
  imageUrls?: string[];
  availableCategories?: string[];
  availableSubcategories?: { category: string; subs: string[] }[];
}): Promise<ProductAiPack> {
  const catList = params.availableCategories?.length ? params.availableCategories.join(', ') : '';
  const subList = params.availableSubcategories?.length
    ? params.availableSubcategories.map(s => `${s.category}: ${s.subs.join(', ')}`).join('\n')
    : '';

  const prompt = `Eres una experta en catalogación y copywriting para e-commerce en Chile.
Debes analizar primero las imágenes del producto. Luego usa el nombre actual, la descripción actual y la categoría solo como apoyo.

Nombre actual: ${params.name || 'Sin nombre'}
Categoría: ${params.category || 'General'}
Descripción actual: ${params.description || 'Sin descripción'}

Objetivo:
1. Proponer 5 títulos SEO.
2. Elegir el mejor título final.
3. Crear una descripción comercial clara.
4. Completar ficha técnica con:
   - details
   - usage
   - ingredients
5. Generar 8 tags/etiquetas relevantes.
6. Asignar la categoría y subcategoría más adecuada.

Reglas:
- No inventes cosas absurdas o imposibles de ver.
- Si un dato no se puede confirmar visualmente, usa formulaciones prudentes y útiles para e-commerce.
- El título final debe sonar natural y vender bien.
- La descripción debe ser breve, clara y persuasiva.
- details debe enfocarse en beneficios y características visibles o razonables.
- usage debe explicar cómo se usa de forma práctica.
- ingredients no debe inventar composición química exacta; si no es visible, redacta una nota breve orientada a revisar el empaque.
- Los tags deben ser cortos (1-3 palabras), en español, separados por coma.
${catList ? `- DEBES elegir la categoría EXACTA de esta lista: ${catList}` : ''}
${subList ? `- DEBES elegir la subcategoría EXACTA de esta lista:\n${subList}` : ''}
- Si ninguna categoría encaja perfectamente, elige la más cercana.
- Responde SOLO JSON válido.

Formato exacto:
{
  "titles": ["", "", "", "", ""],
  "selectedTitle": "",
  "description": "",
  "details": "",
  "usage": "",
  "ingredients": "",
  "tags": ["", "", "", "", "", "", "", ""],
  "suggestedCategory": "",
  "suggestedSubcategory": ""
}`;

  const raw = await callGemini(prompt, { imageUrls: params.imageUrls || [] });
  const cleaned = cleanJsonBlock(raw);
  const parsed = JSON.parse(cleaned) as Partial<ProductAiPack>;

  const titles = Array.isArray(parsed.titles)
    ? parsed.titles.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
    : [];

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    titles,
    selectedTitle: String(parsed.selectedTitle || titles[0] || params.name || '').trim(),
    description: String(parsed.description || '').trim(),
    details: String(parsed.details || '').trim(),
    usage: String(parsed.usage || '').trim(),
    ingredients: String(parsed.ingredients || '').trim(),
    tags,
    suggestedCategory: String(parsed.suggestedCategory || '').trim(),
    suggestedSubcategory: String(parsed.suggestedSubcategory || '').trim(),
  };
}
