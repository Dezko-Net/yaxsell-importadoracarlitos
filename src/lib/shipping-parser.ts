/**
 * Parser inteligente para datos de envío desde texto libre del cliente.
 * Acepta RUT sin guión, deduce región desde comuna, y tiene lista completa de comunas.
 */

// ── RUT ──────────────────────────────────────────────────────────────────────
// Acepta: 12.345.678-9, 12345678-9, 123456789, 12345678-K, 12.345.678
// Normaliza a formato 12345678-9
export function parseRut(text: string): string | null {
  // Buscar patrones: con o sin puntos, con o sin guión
  const match = text.match(/\b(\d{1,2}\.?\d{3}\.?\d{3})-?([\dkK])?\b/i);
  if (!match) return null;

  let num = match[1].replace(/\./g, "");
  let dv: string = match[2] || "";

  // Si no hay dígito verificador, intentar calcularlo
  if (!dv) {
    const calculated = calculateRutDv(num);
    if (!calculated) return null; // número demasiado corto o inválido
    dv = calculated;
  }

  return `${num}-${dv.toUpperCase()}`;
}

// Calcular dígito verificador del RUT chileno
function calculateRutDv(rutNum: string): string | null {
  const num = parseInt(rutNum, 10);
  if (isNaN(num) || rutNum.length < 7) return null;

  let sum = 0;
  let mul = 2;
  const digits = rutNum.split("").reverse();
  for (const d of digits) {
    sum += parseInt(d, 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const mod = 11 - (sum % 11);
  if (mod === 11) return "0";
  if (mod === 10) return "K";
  return String(mod);
}

// ── COMUNAS Y REGIONES ───────────────────────────────────────────────────────
// Mapa comuna → región (normalizado a minúsculas sin acentos para matching)
export const COMUNA_TO_REGION: Record<string, string> = {
  // Región Metropolitana
  "santiago centro": "Metropolitana",
  "santiago": "Metropolitana",
  "providencia": "Metropolitana",
  "maipu": "Metropolitana",
  "maipú": "Metropolitana",
  "las condes": "Metropolitana",
  "vitacura": "Metropolitana",
  "lo barnechea": "Metropolitana",
  "nunoa": "Metropolitana",
  "ñuñoa": "Metropolitana",
  "la florida": "Metropolitana",
  "puente alto": "Metropolitana",
  "san miguel": "Metropolitana",
  "estacion central": "Metropolitana",
  "estación central": "Metropolitana",
  "quinta normal": "Metropolitana",
  "renca": "Metropolitana",
  "cerro navia": "Metropolitana",
  "huechuraba": "Metropolitana",
  "independencia": "Metropolitana",
  "recoleta": "Metropolitana",
  "la reina": "Metropolitana",
  "penalolen": "Metropolitana",
  "peñalolén": "Metropolitana",
  "la granja": "Metropolitana",
  "san ramon": "Metropolitana",
  "san ramón": "Metropolitana",
  "la cisterna": "Metropolitana",
  "el bosque": "Metropolitana",
  "pedro aguirre cerda": "Metropolitana",
  "lo espejo": "Metropolitana",
  "pudahuel": "Metropolitana",
  "quilicura": "Metropolitana",
  "conchali": "Metropolitana",
  "conchalí": "Metropolitana",
  "macul": "Metropolitana",
  "cerrillos": "Metropolitana",
  "san bernardo": "Metropolitana",
  "buin": "Metropolitana",
  "paine": "Metropolitana",
  "colina": "Metropolitana",
  "lampa": "Metropolitana",
  "tiltil": "Metropolitana",
  "pirque": "Metropolitana",
  "calera de tango": "Metropolitana",
  "san jose de maipo": "Metropolitana",
  "padre hurtado": "Metropolitana",
  "peñaflor": "Metropolitana",
  "talagante": "Metropolitana",
  "el monte": "Metropolitana",
  "isla de maipo": "Metropolitana",
  "melipilla": "Metropolitana",
  "maria pinto": "Metropolitana",
  "curacavi": "Metropolitana",
  "curacaví": "Metropolitana",
  "alhue": "Metropolitana",
  "san pedro": "Metropolitana",

  // Valparaíso
  "valparaiso": "Valparaíso",
  "valparaíso": "Valparaíso",
  "vina del mar": "Valparaíso",
  "viña del mar": "Valparaíso",
  "quilpue": "Valparaíso",
  "quilpué": "Valparaíso",
  "villa alemana": "Valparaíso",
  "san antonio": "Valparaíso",
  "san felipe": "Valparaíso",
  "los andes": "Valparaíso",
  "la ligua": "Valparaíso",
  "quillota": "Valparaíso",
  "calera": "Valparaíso",
  "la calera": "Valparaíso",
  "concon": "Valparaíso",
  "concón": "Valparaíso",
  "casablanca": "Valparaíso",
  "cartagena": "Valparaíso",
  "el quisco": "Valparaíso",
  "el tabo": "Valparaíso",
  "algarrobo": "Valparaíso",
  "isla de pascua": "Valparaíso",

  // Biobío
  "concepcion": "Biobío",
  "concepción": "Biobío",
  "talcahuano": "Biobío",
  "chiguayante": "Biobío",
  "san pedro de la paz": "Biobío",
  "coronel": "Biobío",
  "lota": "Biobío",
  "penco": "Biobío",
  "hualpen": "Biobío",
  "hualpén": "Biobío",
  "hualqui": "Biobío",
  "tomé": "Biobío",
  "tome": "Biobío",
  "los angeles": "Biobío",
  "chillan": "Ñuble",
  "chillán": "Ñuble",
  "chillan viejo": "Ñuble",
  "chillán viejo": "Ñuble",
  "bulnes": "Ñuble",
  "yungay": "Ñuble",
  "quillon": "Ñuble",
  "quillón": "Ñuble",
  "coelemu": "Ñuble",
  "cobquecura": "Ñuble",
  "ninhue": "Ñuble",
  "treguaco": "Ñuble",
  "portezuelo": "Ñuble",

  // O'Higgins
  "rancagua": "O'Higgins",
  "machali": "O'Higgins",
  "machalí": "O'Higgins",
  "san fernando": "O'Higgins",
  "rengo": "O'Higgins",
  "san vicente": "O'Higgins",
  "pichilemu": "O'Higgins",
  "santa cruz": "O'Higgins",

  // Maule
  "talca": "Maule",
  "curico": "Maule",
  "curicó": "Maule",
  "linares": "Maule",
  "cauquenes": "Maule",
  "parral": "Maule",
  "constitucion": "Maule",
  "constitución": "Maule",
  "molina": "Maule",

  // Coquimbo
  "la serena": "Coquimbo",
  "coquimbo": "Coquimbo",
  "ovalle": "Coquimbo",
  "illapel": "Coquimbo",
  "andacollo": "Coquimbo",
  "vicuna": "Coquimbo",
  "vicuña": "Coquimbo",
  "monte patria": "Coquimbo",
  "combarbala": "Coquimbo",
  "combarrala": "Coquimbo",
  "punitaqui": "Coquimbo",

  // Antofagasta
  "antofagasta": "Antofagasta",
  "calama": "Antofagasta",
  "tocopilla": "Antofagasta",
  "mejillones": "Antofagasta",
  "taltal": "Antofagasta",
  "maria elena": "Antofagasta",

  // Atacama
  "copiapo": "Atacama",
  "copiapó": "Atacama",
  "vallenar": "Atacama",
  "chañaral": "Atacama",
  "chanaral": "Atacama",
  "diego de almagro": "Atacama",
  "caldera": "Atacama",
  "tierra amarilla": "Atacama",

  // Tarapacá
  "iquique": "Tarapacá",
  "alto hospicio": "Tarapacá",
  "pica": "Tarapacá",
  "pozo almonte": "Tarapacá",

  // Arica y Parinacota
  "arica": "Arica",
  "camarones": "Arica",
  "putre": "Arica",

  // Los Lagos
  "puerto montt": "Los Lagos",
  "puerto varas": "Los Lagos",
  "osorno": "Los Lagos",
  "ancud": "Los Lagos",
  "castro": "Los Lagos",
  "puqueldon": "Los Lagos",
  "puqueldón": "Los Lagos",
  "chonchi": "Los Lagos",
  "dalcahue": "Los Lagos",
  "quisque": "Los Lagos",
  "maullin": "Los Lagos",
  "maullín": "Los Lagos",
  "calbuco": "Los Lagos",
  "cochamo": "Los Lagos",
  "cochamó": "Los Lagos",
  "fresia": "Los Lagos",
  "frutillar": "Los Lagos",
  "llanquihue": "Los Lagos",
  "los muermos": "Los Lagos",
  "rio negro": "Los Lagos",
  "río negro": "Los Lagos",
  "san pablo": "Los Lagos",
  "san juan": "Los Lagos",
  "purranque": "Los Lagos",

  // Los Ríos
  "valdivia": "Los Ríos",
  "la union": "Los Ríos",
  "la unión": "Los Ríos",
  "rio bueno": "Los Ríos",
  "río bueno": "Los Ríos",
  "panguipulli": "Los Ríos",
  "lago ranco": "Los Ríos",
  "futrono": "Los Ríos",
  "lanco": "Los Ríos",
  "mariquina": "Los Ríos",
  "corral": "Los Ríos",
  "paillaco": "Los Ríos",

  // Araucanía
  "temuco": "Araucanía",
  "padre las casas": "Araucanía",
  "villarrica": "Araucanía",
  "pucón": "Araucanía",
  "pucon": "Araucanía",
  "lautaro": "Araucanía",
  "angol": "Araucanía",
  "collipulli": "Araucanía",
  "victoria": "Araucanía",
  "curacautin": "Araucanía",
  "curacautín": "Araucanía",
  "loncoche": "Araucanía",
  "gorbea": "Araucanía",
  "perquenco": "Araucanía",
  "imperial": "Araucanía",
  "nueva imperial": "Araucanía",
  "carahue": "Araucanía",
  "saavedra": "Araucanía",
  "teodoro schmidt": "Araucanía",
  "tolten": "Araucanía",
  "toltén": "Araucanía",
  "cholchol": "Araucanía",
  "melipeuco": "Araucanía",
  "cunco": "Araucanía",
  "lonquimay": "Araucanía",

  // Aysén
  "coyhaique": "Aysén",
  "aysen": "Aysén",
  "puerto aysen": "Aysén",
  "puerto aysén": "Aysén",
  "chile chico": "Aysén",
  "cochrane": "Aysén",
  "puerto bertrand": "Aysén",

  // Magallanes
  "punta arenas": "Magallanes",
  "puerto natales": "Magallanes",
  "porvenir": "Magallanes",
  "ushuaia": "Magallanes",
};

// Normalizar texto: minúsculas, sin acentos
function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i")
    .replace(/ó/g, "o").replace(/ú/g, "u").replace(/ñ/g, "n")
    .trim();
}

// Buscar comuna en el texto y devolver (comunaDisplay, region)
export function findComunaInText(text: string): { comuna: string; region: string } | null {
  const normalized = normalize(text);

  // Buscar la comuna más larga primero (para que "santiago centro" no matchee solo "santiago")
  const sortedComunas = Object.keys(COMUNA_TO_REGION).sort((a, b) => b.length - a.length);

  for (const comunaKey of sortedComunas) {
    const normalizedKey = normalize(comunaKey);
    // Buscar como palabra completa o frase
    const regex = new RegExp(`\\b${normalizedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(normalized)) {
      const region = COMUNA_TO_REGION[comunaKey];
      // Display: capitalizar primera letra de cada palabra
      const comunaDisplay = comunaKey.split(" ").map(w =>
        w.charAt(0).toUpperCase() + w.slice(1)
      ).join(" ");
      return { comuna: comunaDisplay, region };
    }
  }
  return null;
}

// ── REGIONES ─────────────────────────────────────────────────────────────────
const REGION_NAMES = [
  "metropolitana",
  "valparaiso",
  "valparaíso",
  "biobio",
  "biobío",
  "bio bio",
  "araucania",
  "araucanía",
  "ohiggins",
  "o'higgins",
  "maule",
  "nuble",
  "ñuble",
  "los lagos",
  "aysen",
  "aysén",
  "magallanes",
  "antofagasta",
  "atacama",
  "coquimbo",
  "tarapaca",
  "tarapacá",
  "arica",
  "los rios",
  "los ríos",
  "rio negro",
  "río negro",
];

export function findRegionInText(text: string): string | null {
  const normalized = normalize(text);
  for (const r of REGION_NAMES) {
    if (normalized.includes(normalize(r))) {
      // Display bonito
      if (r.includes("metropoli")) return "Metropolitana";
      if (r.includes("valpara")) return "Valparaíso";
      if (r.includes("biob") || r.includes("bio bio")) return "Biobío";
      if (r.includes("araucan")) return "Araucanía";
      if (r.includes("higgins")) return "O'Higgins";
      if (r.includes("maule")) return "Maule";
      if (r.includes("nuble")) return "Ñuble";
      if (r.includes("lagos")) return "Los Lagos";
      if (r.includes("aysen") || r.includes("aysén")) return "Aysén";
      if (r.includes("magallanes")) return "Magallanes";
      if (r.includes("antofagasta")) return "Antofagasta";
      if (r.includes("atacama")) return "Atacama";
      if (r.includes("coquimbo")) return "Coquimbo";
      if (r.includes("tarapac")) return "Tarapacá";
      if (r.includes("arica")) return "Arica";
      if (r.includes("rios") || r.includes("ríos")) return "Los Ríos";
    }
  }
  return null;
}

// ── AGENCIAS ─────────────────────────────────────────────────────────────────
export function findAgencyInText(text: string): string | null {
  const lower = text.toLowerCase();
  const match = lower.match(
    /\b(starken|pullman\s*cargo|pullman|varmontt|bluexpress|blu\s*express|cyc|tvp|cruz\s*del\s*sur|tramar|5\s*sur|5sur|mena|cacem|jt\s*transportes|chilexpress|retiro\s+(en\s+)?tienda|retiro)\b/,
  );
  if (!match) return null;
  const m = match[0];
  if (m.includes("blu")) return "BLUEXPRESS";
  if (m.includes("pullman")) return "PULLMAN CARGO";
  if (m.includes("cruz")) return "CRUZ DEL SUR";
  if (m.includes("5") && m.includes("sur")) return "5SUR";
  if (m.includes("jt")) return "JT TRANSPORTES";
  if (m.includes("retiro")) return "RETIRO EN TIENDA";
  return m.toUpperCase().trim();
}

// ── PARSER COMPLETO ──────────────────────────────────────────────────────────
export interface ParsedShippingData {
  rut: string;
  address: string;
  comuna: string;
  region: string;
  agency: string;
  email: string;
  missing: string[];
}

export function parseShippingData(rawText: string): ParsedShippingData {
  const text = rawText.trim();
  const lowerData = text.toLowerCase();

  // RUT
  const rut = parseRut(text) || "";

  // Agencia
  const agency = findAgencyInText(text) || "";

  // Email
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const email = emailMatch ? emailMatch[0] : "";

  // Comuna + región (deducida desde comuna)
  const comunaResult = findComunaInText(text);
  let comuna = comunaResult?.comuna || "";
  let region = comunaResult?.region || "";

  // Si no se dedujo región desde comuna, buscar región explícita
  if (!region) {
    region = findRegionInText(text) || "";
  }

  // Quitar partes conocidas para encontrar la dirección
  let remaining = text;
  // Quitar RUT (todas sus variantes: con puntos, con guión, sin guión, sin puntos)
  if (rut) {
    // Buscar el RUT original en el texto con un regex flexible que atrape todas las formas
    const rutNum = rut.split("-")[0]; // 12345678
    const rutDv = rut.split("-")[1]; // 9
    // Regex: número del RUT con o sin puntos, seguido de guión opcional y dv
    const rutFlexible = new RegExp(
      `${rutNum.replace(/(.)(?=.)/g, "$1\\.?")}-?${rutDv}`,
      "gi"
    );
    remaining = remaining.replace(rutFlexible, "");
    // También quitar sin dv (por si el cliente no lo escribió)
    remaining = remaining.replace(new RegExp(`\\b${rutNum}\\b`, "gi"), "");
  }
  // Quitar agencia
  if (agency) {
    remaining = remaining.replace(new RegExp(agency, "gi"), "");
    // Quitar también variaciones comunes
    remaining = remaining.replace(/\b(starken|pullman|varmontt|bluexpress|blu express|cyc|tvp|cruz del sur|tramar|5sur|5 sur|mena|cacem|jt transportes|chilexpress|retiro en tienda|retiro)\b/gi, "");
  }
  // Quitar email
  if (email) remaining = remaining.replace(email, "");
  // Quitar región
  if (region) {
    remaining = remaining.replace(new RegExp(region, "gi"), "");
  }
  // Quitar comuna
  if (comuna) {
    remaining = remaining.replace(new RegExp(comuna, "gi"), "");
  }
  // Quitar palabras clave
  remaining = remaining.replace(
    /\b(termin[eé]|acab[eé]|finalizar|listo|ya)\b/gi, "",
  );
  remaining = remaining.replace(
    /\b(rut|direcci[oó]n|direccion|comuna|regi[oó]n|region|agencia|email|correo|env[ií]o|envio|transporte)\s*[:\-]?\s*/gi, "",
  );
  // Limpiar
  remaining = remaining.replace(/\s+/g, " ").trim();
  remaining = remaining.replace(/^[\s,;:|-]+|[\s,;:|-]+$/g, "");

  // La dirección es lo que queda
  let address = remaining;

  // Si no hay dirección pero hay partes, intentar separar por comas
  if (!address) {
    const parts = text.split(/\s*,\s*|\s{2,}/).filter((p) => p.length > 1);
    // Quitar las partes que ya identificamos
    const knownParts = [rut, agency, email, comuna, region].filter(Boolean).map(p => p.toLowerCase());
    const addrParts = parts.filter(p => {
      const pl = p.toLowerCase();
      return !knownParts.some(k => pl.includes(k) || k.includes(pl));
    });
    if (addrParts.length > 0) {
      address = addrParts.join(", ");
    }
  }

  // Calcular campos faltantes
  const missing: string[] = [];
  if (!rut) missing.push("RUT");
  if (!address) missing.push("dirección");
  if (!comuna) missing.push("comuna");
  if (!region) missing.push("región");
  if (!agency) missing.push("agencia de envío");

  return { rut, address, comuna, region, agency, email, missing };
}
