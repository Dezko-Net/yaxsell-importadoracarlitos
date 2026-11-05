/**
 * Traducción directa por Cascade (sin API externa)
 * Traduce categorías chinas → español y asigna categoría + subcategoría
 */
const XLSX = require('xlsx');

// ── MAPA DE CATEGORÍAS (traducido por Cascade) ───────────────────────────────
// Formato: "categoria_original": ["Categoria ES", "Subcategoria ES"]
const CAT_MAP = {
  "": ["Sin Categoría", "General"],
  "00护肤品套装": ["Cuidado de la Piel", "Sets de Cuidado"],
  "01A香薰精油 ACEITES AROMATICOS": ["Aromaterapia", "Aceites Aromáticos"],
  "01B香薰加湿器 HUMIDIFICADORES": ["Aromaterapia", "Humidificadores"],
  "01店长推荐香水套装-PERFUM": ["Perfumería", "Sets de Perfume"],
  "02A 香薰 30MLDIFUSORES AROMATICOS": ["Aromaterapia", "Difusores 30ml"],
  "02B  香薰  40ML  DIFUSORES AROMATICOS": ["Aromaterapia", "Difusores 40ml"],
  "02C 香薰 50ML DIFUSORES AROMATICOS": ["Aromaterapia", "Difusores 50ml"],
  "02D 香薰 100ML DIFUSORES AROMATICOS": ["Aromaterapia", "Difusores 100ml"],
  "02E 香薰 120ML DIFUSORES AROMATICOS": ["Aromaterapia", "Difusores 120ml"],
  "02I车载挂件香薰": ["Aromaterapia", "Aromatizantes para Auto"],
  "02J家居车载香薰": ["Aromaterapia", "Ambientadores Hogar y Auto"],
  "02K香薰套装礼盒  感恩母亲节SETS AROMATICOS": ["Aromaterapia", "Sets Aromáticos"],
  "02M香薰蜡烛 VELAS AROMATICAS": ["Aromaterapia", "Velas Aromáticas"],
  "02N香薰炉 QUEMADORES DE ACEITE": ["Aromaterapia", "Quemadores de Aceite"],
  "02O水晶烛台 CANDELABROS": ["Hogar y Decoración", "Candelabros"],
  "02P工艺摆件 DECORACION": ["Hogar y Decoración", "Decoración"],
  "02店长推荐口红唇彩套装 Set de Labial": ["Maquillaje", "Sets de Labial"],
  "03A化妆镜系列 ESPEJOS CON PEINE": ["Accesorios de Belleza", "Espejos de Maquillaje"],
  "03B 饰品收纳＋玻璃托盘": ["Accesorios de Belleza", "Organizadores"],
  "03C化妆箱三件套 SET MALETAS DE MAQUILLAJE": ["Accesorios de Belleza", "Sets Maletas de Maquillaje"],
  "03D化妆收纳箱 MALETAS DE MAQUILLAJE": ["Accesorios de Belleza", "Maletas de Maquillaje"],
  "03店长推荐化妆品套装SET MAQUILLAJE": ["Maquillaje", "Sets de Maquillaje"],
  "04新款眼影盘": ["Maquillaje", "Paletas de Sombras"],
  "05A卸妆湿巾 TOALLAS DESMAQUILLANTES": ["Cuidado de la Piel", "Toallas Desmaquillantes"],
  "05B儿童清洁湿巾 TOALLAS LIMPIADORAS": ["Higiene Personal", "Toallas Limpiadoras Infantiles"],
  "05彩妆系列--口红 labial": ["Maquillaje", "Labial"],
  "06加湿器": ["Aromaterapia", "Humidificadores"],
  "06化妆刷套装 ESPONJAS Y BROCHAS": ["Accesorios de Belleza", "Brochas y Esponjas"],
  "06彩妆系列--唇彩、变色唇彩 Brillo labial": ["Maquillaje", "Brillo Labial"],
  "07彩妆系列--唇油 ACIETE DE LABIOS": ["Maquillaje", "Aceite de Labios"],
  "07睫毛夹 ENCRESPADORES": ["Accesorios de Belleza", "Rizadores de Pestañas"],
  "08-1眉夹眉钳鼻毛剪指甲钳": ["Manicure y Uñas", "Sets de Manicure"],
  "08-3睫毛夹": ["Accesorios de Belleza", "Rizadores de Pestañas"],
  "08修眉刀 PERFILADORES": ["Accesorios de Belleza", "Perfiladores de Cejas"],
  "08彩妆系列--润唇膏，唇部精华 BALSAMO Y SERUM LABIAL": ["Maquillaje", "Bálsamo y Sérum Labial"],
  "09彩妆系列--口红水，TINTA": ["Maquillaje", "Tinte Labial"],
  "09眉夹眉钳鼻毛剪指甲钳 SETS DE MANICURE": ["Manicure y Uñas", "Sets de Manicure"],
  "10化妆刷套装": ["Accesorios de Belleza", "Sets de Brochas"],
  "10彩妆系列--唇线笔 DELINEADOR DE LABIOS": ["Maquillaje", "Delineador de Labios"],
  "11化妆箱": ["Accesorios de Belleza", "Maletas de Maquillaje"],
  "11彩妆系列--小眼影，PALETA DE SOMBRAS ANYLADY": ["Maquillaje", "Paletas de Sombras"],
  "12网红鸡蛋花发夹": ["Cuidado Capilar", "Accesorios para el Cabello"],
  "13彩妆系列--眼影KEVINCOCO": ["Maquillaje", "Paletas de Sombras"],
  "13文具系列": ["Varios", "Papelería"],
  "13湿巾": ["Higiene Personal", "Toallas Húmedas"],
  "14彩妆系列--气垫粉底液、CUSHION": ["Maquillaje", "Base Cushion"],
  "15彩妆系列--粉底液BASE": ["Maquillaje", "Base de Maquillaje"],
  "15陶瓷杯子组合套装 JUEGO DE TAZAS": ["Hogar y Decoración", "Juego de Tazas"],
  "16新款小百货": ["Varios", "Novedades"],
  "17彩妆系列--粉饼、散粉   POLVO": ["Maquillaje", "Polvo Facial"],
  "18彩妆系列--眉粉 POLVO PARA CEJAS": ["Maquillaje", "Polvo para Cejas"],
  "19床上用品三件套 四件套 JUEGOS DE CAMA": ["Hogar y Decoración", "Ropa de Cama"],
  "19彩妆系列--高光 腮红 ILUMINADOR": ["Maquillaje", "Iluminador y Rubor"],
  "20彩妆系列--妆前乳 PRIMER": ["Maquillaje", "Prebase de Maquillaje"],
  "20毛毯": ["Hogar y Decoración", "Cobijas y Mantas"],
  "21彩妆系列--眼线笔 delineador de ojos": ["Maquillaje", "Delineador de Ojos"],
  "22彩妆系列--睫毛膏 MALEETA MAQUILLAJE": ["Maquillaje", "Rímel"],
  "24彩妆系列--定妆喷雾、定妆粉 FIJADOR DE MAQUILLAJE": ["Maquillaje", "Fijador de Maquillaje"],
  "25 脸部护肤系列--精华,精华液 serum facial": ["Cuidado de la Piel", "Sérum Facial"],
  "26 脸部护肤系列--爽肤水TONICO FACIAL": ["Cuidado de la Piel", "Tónico Facial"],
  "27 脸部护肤系列--洗面奶 LIMPIADOR FACIAL": ["Cuidado de la Piel", "Limpiador Facial"],
  "28 脸部护肤系列--卸妆水 DESMAQUILLANTES": ["Cuidado de la Piel", "Desmaquillante"],
  "29 脸部护肤系列--面霜 眼霜 CREMA FACIAL,CREMA PARA OJOS": ["Cuidado de la Piel", "Crema Facial y Contorno de Ojos"],
  "30 脸部护肤系列--面膜，MASCARILLA FACIAL": ["Cuidado de la Piel", "Mascarilla Facial"],
  "31身体护肤系列-身体乳 CREMA COOPORAL": ["Cuerpo e Higiene", "Crema Corporal"],
  "32身体护肤系列--手霜 脚霜 CREMA PARA MANOS Y PIES": ["Cuerpo e Higiene", "Crema para Manos y Pies"],
  "33身体护肤系列--磨砂膏 文身提亮膏 EXFOLIANTE": ["Cuerpo e Higiene", "Exfoliante Corporal"],
  "35洗护发用品--发油、发膜、发蜡": ["Cuidado Capilar", "Tratamientos Capilares"],
  "36指甲油 ESMALTE DE UNAS": ["Manicure y Uñas", "Esmalte de Uñas"],
  "37指甲油 延长胶 营养油": ["Manicure y Uñas", "Esmalte y Accesorios"],
  "38美甲系列--打磨机 美甲灯 tornos y lamparas de manicura": ["Manicure y Uñas", "Tornos y Lámparas"],
  "39美甲系列--甲片 胶水 色卡 unas postizas": ["Manicure y Uñas", "Uñas Postizas"],
  "40美甲系列--美甲工具 纸托 手枕 papel de molde para unas": ["Manicure y Uñas", "Herramientas de Manicure"],
  "42美甲系列--美甲装饰 decoraciones para unas": ["Manicure y Uñas", "Decoraciones para Uñas"],
  "44美甲系列--指甲笔": ["Manicure y Uñas", "Pinceles para Uñas"],
  "45美甲系列--修甲工具 set de manicura corta cuticula": ["Manicure y Uñas", "Sets de Manicure"],
  "46美甲系列--美甲死皮剪 CORTA DE UNA": ["Manicure y Uñas", "Corta Cutículas"],
  "49化妆刷套装系列 set de brochas": ["Accesorios de Belleza", "Sets de Brochas"],
  "50海绵粉扑系列 esponja de maquillaje": ["Accesorios de Belleza", "Esponjas de Maquillaje"],
  "51清洁卸妆产品 limpieza delrostro": ["Cuidado de la Piel", "Limpieza y Desmaquillante"],
  "52脱毛系列 --蜡锅 蜜蜡 脱毛纸 脱毛棒 paletas y ollase cera depil": ["Depilación", "Depilación con Cera"],
  "55睫毛配件 ACCESORIOS DE PESTANAS": ["Accesorios de Belleza", "Accesorios de Pestañas"],
  "56烫睫毛 LIFTING DE PESTANAS": ["Accesorios de Belleza", "Lifting de Pestañas"],
  "58假睫毛 嫁接睫毛 睫毛工具 pegamento para pestanasp": ["Accesorios de Belleza", "Pestañas Postizas"],
  "59沙龙系列--吹风机 secador de cabello": ["Cuidado Capilar", "Secadores de Cabello"],
  "60沙龙系列--夹板 plancha de cabello": ["Cuidado Capilar", "Planchas de Cabello"],
  "61沙龙系列--电动理发剪 剃须刀 maquina de afeitar y cortar cabel": ["Cuidado Capilar", "Máquinas de Corte y Afeitado"],
  "63沙龙理发系列--理发刀架 NAVAJA": ["Cuidado Capilar", "Navajas de Barbería"],
  "64沙龙系列--梳子 ceoillos antifrizz peines de peluqueri": ["Cuidado Capilar", "Peines y Cepillos"],
  "65沙龙系列--烫染工具 capas ,peinesta ,posillos de tinturap": ["Cuidado Capilar", "Accesorios de Tintura"],
  "67宠物用品 maquina y kit de tijeras para mascota": ["Varios", "Accesorios para Mascotas"],
  "70化妆箱 收纳箱 化妆包 不含税  maletas de maquillaje y grndes3": ["Accesorios de Belleza", "Maletas y Bolsos de Maquillaje"],
  "72 儿童发箍 儿童发夹": ["Cuidado Capilar", "Accesorios Infantiles para Cabello"],
  "73 水杯 BOTELLAS": ["Hogar y Decoración", "Botellas y Vasos"],
  "74特价指甲50%折扣OFERTA  眉粉cejas，请分开单独下单": ["Manicure y Uñas", "Ofertas Especiales"],
  "75特价指甲50%折扣OFERTA DE UNAS,  请分开单独下单": ["Manicure y Uñas", "Ofertas Especiales"],
  "AUDIFONO": ["Electrónica", "Audífonos"],
  "COSMETIQUERO": ["Accesorios de Belleza", "Cosmetiqueros"],
  "LAMPARA DE EMERGENCIA": ["Hogar y Decoración", "Lámparas"],
  "MOCHILA": ["Varios", "Mochilas"],
  "PLUMONES DE CAMA": ["Hogar y Decoración", "Plumones de Cama"],
  "TOALLA DESMAQUILLANTE": ["Cuidado de la Piel", "Toallas Desmaquillantes"],
  "乳液": ["Cuidado de la Piel", "Loción Facial"],
  "儿童背包": ["Varios", "Mochilas Infantiles"],
  "加湿器": ["Aromaterapia", "Humidificadores"],
  "化妆刷": ["Accesorios de Belleza", "Brochas de Maquillaje"],
  "化妆工具套装": ["Accesorios de Belleza", "Sets de Herramientas"],
  "化妆棉": ["Cuidado de la Piel", "Algodones Desmaquillantes"],
  "化妆箱": ["Accesorios de Belleza", "Maletas de Maquillaje"],
  "发夹": ["Cuidado Capilar", "Pasadores y Pinzas"],
  "发膜": ["Cuidado Capilar", "Mascarilla Capilar"],
  "口红": ["Maquillaje", "Labial"],
  "口红水": ["Maquillaje", "Tinte Labial"],
  "唇彩": ["Maquillaje", "Brillo Labial"],
  "唇彩口红唇线笔套装": ["Maquillaje", "Sets de Labial"],
  "唇彩口红眼线笔眼影套装": ["Maquillaje", "Sets de Maquillaje"],
  "唇彩眼影套装": ["Maquillaje", "Sets de Labial y Sombra"],
  "唇油": ["Maquillaje", "Aceite de Labios"],
  "唇膏": ["Maquillaje", "Bálsamo Labial"],
  "唇膏唇油": ["Maquillaje", "Bálsamo y Aceite Labial"],
  "唇膜润唇膏": ["Maquillaje", "Mascarilla y Bálsamo Labial"],
  "妆前乳": ["Maquillaje", "Prebase de Maquillaje"],
  "定妆粉": ["Maquillaje", "Polvo Fijador"],
  "家具工艺摆件": ["Hogar y Decoración", "Decoración del Hogar"],
  "干发帽发带套装": ["Cuidado Capilar", "Accesorios para el Cabello"],
  "手膜": ["Cuerpo e Higiene", "Mascarilla de Manos"],
  "手霜": ["Cuerpo e Higiene", "Crema de Manos"],
  "护肤品套盒": ["Cuidado de la Piel", "Sets de Cuidado"],
  "护肤品套装": ["Cuidado de la Piel", "Sets de Cuidado"],
  "摆件烛台": ["Hogar y Decoración", "Candelabros Decorativos"],
  "杯子": ["Hogar y Decoración", "Tazas y Vasos"],
  "气垫粉": ["Maquillaje", "Base Cushion"],
  "沐浴露身体乳身体喷雾套装": ["Cuerpo e Higiene", "Sets de Baño y Cuerpo"],
  "沐浴露身体乳身体喷雾香水套装": ["Cuerpo e Higiene", "Sets de Baño y Perfume"],
  "沐浴露身体喷雾身体乳套装": ["Cuerpo e Higiene", "Sets de Baño y Cuerpo"],
  "洗发水": ["Cuidado Capilar", "Shampoo"],
  "洗面奶": ["Cuidado de la Piel", "Limpiador Facial"],
  "润唇膏": ["Maquillaje", "Bálsamo Labial"],
  "湿巾": ["Higiene Personal", "Toallas Húmedas"],
  "爽肤水": ["Cuidado de la Piel", "Tónico Facial"],
  "眉笔": ["Maquillaje", "Lápiz para Cejas"],
  "眼影": ["Maquillaje", "Sombra de Ojos"],
  "眼影唇彩口红套装": ["Maquillaje", "Sets de Maquillaje"],
  "眼影唇彩套装": ["Maquillaje", "Sets de Ojos y Labios"],
  "眼影套装": ["Maquillaje", "Sets de Sombras"],
  "眼线液": ["Maquillaje", "Delineador de Ojos Líquido"],
  "眼线笔": ["Maquillaje", "Delineador de Ojos"],
  "眼膜": ["Cuidado de la Piel", "Mascarilla para Ojos"],
  "眼霜": ["Cuidado de la Piel", "Crema Contorno de Ojos"],
  "睫毛夹": ["Accesorios de Belleza", "Rizador de Pestañas"],
  "睫毛膏": ["Maquillaje", "Rímel"],
  "睫毛膏套装": ["Maquillaje", "Sets de Rímel"],
  "粉底液": ["Maquillaje", "Base de Maquillaje"],
  "粉扑": ["Accesorios de Belleza", "Esponja de Maquillaje"],
  "粉扑套装": ["Accesorios de Belleza", "Sets de Esponjas"],
  "精华": ["Cuidado de la Piel", "Sérum Facial"],
  "纸巾": ["Higiene Personal", "Pañuelos de Papel"],
  "脚膜": ["Cuerpo e Higiene", "Mascarilla de Pies"],
  "腮红": ["Maquillaje", "Rubor"],
  "腮红修容": ["Maquillaje", "Rubor y Contorno"],
  "腮红高光": ["Maquillaje", "Rubor e Iluminador"],
  "腮红高光修容": ["Maquillaje", "Rubor, Iluminador y Contorno"],
  "身体乳": ["Cuerpo e Higiene", "Crema Corporal"],
  "身体乳液": ["Cuerpo e Higiene", "Loción Corporal"],
  "身体乳香水": ["Cuerpo e Higiene", "Set Crema Corporal y Perfume"],
  "身体喷雾": ["Cuerpo e Higiene", "Spray Corporal"],
  "遮瑕": ["Maquillaje", "Corrector"],
  "非自家备案号不上友购": ["Varios", "General"],
  "面膜": ["Cuidado de la Piel", "Mascarilla Facial"],
  "面霜": ["Cuidado de la Piel", "Crema Facial"],
  "额头除皱贴": ["Cuidado de la Piel", "Parches Anti-Arrugas"],
  "香水": ["Perfumería", "Perfume"],
  "香水身体乳套装": ["Perfumería", "Sets de Perfume y Crema"],
  "香珠": ["Aromaterapia", "Perlas Aromáticas"],
  "香薰": ["Aromaterapia", "Difusor Aromático"],
  "香薰套装礼盒": ["Aromaterapia", "Sets Aromáticos"],
  "高光": ["Maquillaje", "Iluminador"],
  "高光腮红修容": ["Maquillaje", "Iluminador, Rubor y Contorno"],
};

// Traducción de nombres chinos para los 31 sin nombre español
// (se basa en el nombre CN directamente)
function translateNameFromChinese(nameCn) {
  // No translation needed if already has latin characters
  if (!nameCn) return '';
  const hasLatin = /[a-zA-Z]/.test(nameCn);
  if (hasLatin) return nameCn; // Already partially in Spanish/English

  // Common patterns
  const patterns = [
    [/精华液/, 'Sérum'],
    [/精华/, 'Sérum'],
    [/面膜/, 'Mascarilla Facial'],
    [/面霜/, 'Crema Facial'],
    [/眼霜/, 'Crema Contorno de Ojos'],
    [/口红/, 'Labial'],
    [/唇彩/, 'Brillo Labial'],
    [/唇膏/, 'Bálsamo Labial'],
    [/唇油/, 'Aceite de Labios'],
    [/爽肤水/, 'Tónico Facial'],
    [/洗面奶/, 'Limpiador Facial'],
    [/卸妆/, 'Desmaquillante'],
    [/眼影/, 'Sombra de Ojos'],
    [/眼线/, 'Delineador de Ojos'],
    [/睫毛膏/, 'Rímel'],
    [/睫毛夹/, 'Rizador de Pestañas'],
    [/假睫毛/, 'Pestañas Postizas'],
    [/腮红/, 'Rubor'],
    [/高光/, 'Iluminador'],
    [/粉底液/, 'Base de Maquillaje'],
    [/气垫/, 'Cushion'],
    [/散粉|粉饼/, 'Polvo Facial'],
    [/定妆/, 'Fijador de Maquillaje'],
    [/妆前乳/, 'Prebase de Maquillaje'],
    [/指甲油/, 'Esmalte de Uñas'],
    [/身体乳/, 'Crema Corporal'],
    [/手霜/, 'Crema de Manos'],
    [/脚膜/, 'Mascarilla de Pies'],
    [/香水/, 'Perfume'],
    [/香薰/, 'Difusor Aromático'],
    [/蜡烛/, 'Vela Aromática'],
    [/眉笔|眉粉/, 'Lápiz para Cejas'],
    [/遮瑕/, 'Corrector'],
    [/化妆刷|刷套装/, 'Set de Brochas'],
    [/化妆棉/, 'Algodones Desmaquillantes'],
    [/粉扑|海绵/, 'Esponja de Maquillaje'],
    [/洗发水/, 'Shampoo'],
    [/发膜/, 'Mascarilla Capilar'],
    [/吹风机/, 'Secador de Cabello'],
    [/夹板/, 'Plancha de Cabello'],
  ];

  for (const [pattern, translation] of patterns) {
    if (pattern.test(nameCn)) return translation;
  }
  return nameCn; // Keep original if no pattern matches
}

// ── Main ──────────────────────────────────────────────────────
function main() {
  console.log('=== TRADUCCIÓN DIRECTA POR CASCADE ===\n');

  // Load Excel
  console.log('Cargando Excel...');
  const wb = XLSX.readFile('C:/Proyectos/PROJECT YAXSEL/excels/productos_con_stock.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const products = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`${products.length} productos\n`);

  // Apply translations
  let catNotFound = 0;
  let nameTranslated = 0;

  const finalRows = products.map(r => {
    const sku = String(r['Codigo'] || '').trim();
    const categoryRaw = String(r['Categoria'] || '').trim();
    const nameEs = String(r['Nombre del producto 2'] || '').trim();
    const nameCn = String(r['Nombre del producto 1'] || '').trim();

    // Category translation
    let catEs = 'Sin Categoría';
    let subCat = 'General';
    const catEntry = CAT_MAP[categoryRaw];
    if (catEntry) {
      catEs = catEntry[0];
      subCat = catEntry[1];
    } else {
      catNotFound++;
      // Try partial match
      for (const [key, val] of Object.entries(CAT_MAP)) {
        if (key && categoryRaw.includes(key)) {
          catEs = val[0];
          subCat = val[1];
          break;
        }
      }
    }

    // Name: use Spanish if available, otherwise translate CN
    let finalName = nameEs;
    if (!finalName) {
      finalName = translateNameFromChinese(nameCn);
      if (finalName !== nameCn) nameTranslated++;
    }

    // Parse price numbers
    const parsePrice = (v) => {
      const s = String(v || '').replace(/[^\d.]/g, '');
      return parseFloat(s) || 0;
    };

    return {
      'Codigo': sku,
      'Código Barra': r['Código Barra'],
      'Categoria': catEs,
      'Subcategoria': subCat,
      'Nombre ES': finalName,
      'Nombre CN': nameCn,
      'Precio Retail': parsePrice(r['Precio por paquete']),
      'Precio Caja': parsePrice(r['Precio por caja']),
      'Stock': r['Stock'],
    };
  });

  console.log(`Categorías no encontradas en mapa: ${catNotFound}`);
  console.log(`Nombres traducidos del chino: ${nameTranslated}`);

  // Save main Excel
  const outWb = XLSX.utils.book_new();
  const outWs = XLSX.utils.json_to_sheet(finalRows);
  XLSX.utils.book_append_sheet(outWb, outWs, 'Productos');
  const outPath = 'C:/Proyectos/PROJECT YAXSEL/excels/productos_traducidos.xlsx';
  XLSX.writeFile(outWb, outPath);
  console.log(`\n✅ Excel guardado: ${outPath}`);

  // Save categories summary
  const catMap = {};
  finalRows.forEach(r => {
    const key = r['Categoria'];
    const sub = r['Subcategoria'];
    if (!catMap[key]) catMap[key] = new Set();
    if (sub) catMap[key].add(sub);
  });

  const catRows = [];
  for (const [cat, subs] of Object.entries(catMap).sort()) {
    for (const sub of [...subs].sort()) {
      catRows.push({
        Categoria: cat,
        Subcategoria: sub,
        'Nº Productos': finalRows.filter(r => r['Categoria'] === cat && r['Subcategoria'] === sub).length
      });
    }
  }

  const catWb = XLSX.utils.book_new();
  const catWs = XLSX.utils.json_to_sheet(catRows);
  XLSX.utils.book_append_sheet(catWb, catWs, 'Categorias');
  XLSX.writeFile(catWb, 'C:/Proyectos/PROJECT YAXSEL/excels/categorias_generadas.xlsx');

  // Stats
  const mainCats = Object.keys(catMap);
  console.log(`✅ Categorías principales: ${mainCats.length}`);
  console.log(`   ${mainCats.sort().join(', ')}`);
  console.log(`✅ Subcategorías: ${catRows.length}`);
  console.log(`✅ categorias_generadas.xlsx guardado`);
  console.log('\n=== COMPLETADO ===');
}

main();
