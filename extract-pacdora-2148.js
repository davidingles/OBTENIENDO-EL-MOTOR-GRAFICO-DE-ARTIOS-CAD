/**
 * Script de Extracción Completa de los 2,148 Modelos de https://www.pacdora.com/dielines
 * Distribuidos exactamente según la estructura de categorías de la web (By Models y By Uses)
 * en archivos modulares ligeros dentro de assets/pacdora-catalog/
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(process.cwd(), 'assets', 'pacdora-catalog');
const CACHE_FILE = path.join(OUT_DIR, '_raw_cache_2148.json');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const agent = new https.Agent({ keepAlive: true, maxSockets: 24 });

function requestPacdora(urlPath, method = 'GET', headers = {}, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const payload = bodyObj ? JSON.stringify(bodyObj) : null;
    const req = https.request({
      hostname: 'www.pacdora.com',
      path: urlPath,
      method,
      agent,
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.pacdora.com/dielines',
        'Origin': 'https://www.pacdora.com',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('Timeout'));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getExperienceCookie() {
  const exp = await requestPacdora('/api/v2/users/experience_user', 'GET');
  const map = new Map();
  for (const c of (exp.headers['set-cookie'] || [])) {
    const kv = c.split(';')[0];
    const eq = kv.indexOf('=');
    if (eq > 0) map.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function round2(n) {
  return typeof n === 'number' ? Math.round(n * 100) / 100 : n;
}

function compactCmdList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(c => {
    const out = { mtd: c.mtd };
    if (c.x !== undefined) out.x = round2(Number(c.x));
    if (c.y !== undefined) out.y = round2(Number(c.y));
    if (c.rx !== undefined) out.rx = round2(Number(c.rx));
    if (c.ry !== undefined) out.ry = round2(Number(c.ry));
    if (c.ang !== undefined && Number(c.ang) !== 0) out.ang = round2(Number(c.ang));
    if (c.arc !== undefined && Number(c.arc) !== 0) out.arc = Number(c.arc);
    if (c.dir !== undefined && Number(c.dir) !== 0) out.dir = Number(c.dir);
    if (c.cx !== undefined) out.cx = round2(Number(c.cx));
    if (c.cy !== undefined) out.cy = round2(Number(c.cy));
    if (c.foldline) out.foldline = c.foldline;
    return out;
  });
}

function extractBestLayer(layerObj) {
  if (!layerObj || typeof layerObj !== 'object') return null;
  if (layerObj.traditional && Array.isArray(layerObj.traditional.faces) && layerObj.traditional.faces.length > 0) {
    return layerObj.traditional;
  }
  // Para cajas rígidas / multipieza (ej. FlipCoveredFacepaperOutside), elegir la capa principal con más caras y dobleces
  let best = null;
  let bestScore = -1;
  for (const key of Object.keys(layerObj)) {
    const sub = layerObj[key];
    if (sub && Array.isArray(sub.faces) && sub.faces.length > 0) {
      const score = sub.faces.length * 10 + (Array.isArray(sub.folds) ? sub.folds.length * 5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = sub;
      }
    }
  }
  return best;
}

function compactKnifeData(trad) {
  if (!trad) return null;
  return {
    faces: (trad.faces || []).map(f => ({
      name: f.name,
      x: round2(Number(f.x) || 0),
      y: round2(Number(f.y) || 0),
      w: round2(Number(f.w) || 0),
      h: round2(Number(f.h) || 0),
      dlist: compactCmdList(f.dlist || [])
    })),
    holes: (trad.holes || []).map(h => compactCmdList(h)),
    cuts: compactCmdList(trad.cuts || []),
    folds: (trad.folds || []).map(fl => ({
      name: fl.name,
      x1: round2(Number(fl.x1) || 0),
      y1: round2(Number(fl.y1) || 0),
      x2: round2(Number(fl.x2) || 0),
      y2: round2(Number(fl.y2) || 0)
    })),
    sizeArrowData: (trad.sizeArrowData || []).map(sa => ({
      lineName: sa.lineName,
      lineLength: round2(Number(sa.lineLength) || 0),
      p1: sa.p1 ? { x: round2(Number(sa.p1.x)), y: round2(Number(sa.p1.y)) } : undefined,
      p2: sa.p2 ? { x: round2(Number(sa.p2.x)), y: round2(Number(sa.p2.y)) } : undefined,
      tpointer: sa.tpointer ? {
        x: round2(Number(sa.tpointer.x)),
        y: round2(Number(sa.tpointer.y)),
        value: sa.tpointer.value
      } : undefined
    })),
    animations: ((trad.animation && trad.animation.animations) || trad.animations || []).map(step =>
      (Array.isArray(step) ? step : []).map(act => ({
        name: act.name,
        rotate: round2(Number(act.rotate) || 0),
        action: act.action || 'rotate'
      }))
    )
  };
}

const SPANISH_BY_MODELS = {
  'fefco-box-templates': 'FEFCO Boxes (Normas FEFCO)',
  'folding-box-dielines': 'Folding Boxes (Estuches Plegables)',
  'tray-box-dielines': 'Tray Boxes (Bandejas Automontables)',
  'display-box-dielines': 'Display Boxes (Expositores PLV)',
  'tuck-end-box-dielines': 'Tuck End Boxes (Cajas de Lengüeta)',
  'insert-box-dielines': 'Box Inserts (Separadores e Insertos)',
  'paper-bag-dielines': 'Paper Bags (Bolsas de Papel)',
  'rigid-box-dielines': 'Rigid Boxes (Cajas Rígidas / Lujo)',
  'window-box-templates': 'Window Boxes (Cajas con Ventana)',
  'box-with-lid-dielines': 'Boxes with Lid (Cajas con Tapa)',
  'storage-box-dielines': 'Storage Boxes (Cajas de Almacenaje)',
  'tuck-end-box-variation-dielines': 'Tuck End Variations (Variantes Lengüeta)',
  'envelope-dielines': 'Envelopes (Sobres y Carpetas)',
  'sleeve-dielines': 'Sleeves (Fajas y Estuches Deslizantes)',
  'file-pocket-dielines': 'Folders (Portadocumentos y Dossieres)',
  'tag-dielines': 'Cards & Tags (Tarjetas y Etiquetas)',
  'polygonal-box-dielines': 'Polygonal Boxes (Cajas Poligonales)',
  'sphere-box-dielines': 'Sphere Boxes (Cajas Esféricas)',
  'triangle-box-dielines': 'Triangle Boxes (Cajas Triangulares)',
  'pouch-dielines': 'Pouches (Bolsas Flexibles / Doypack)',
  'other-dielines': 'Others (Otros Diseños Estructurales)'
};

const SPANISH_BY_USES = {
  'gift-box-dielines': 'Gift Boxes (Cajas de Regalo)',
  'diy-box-template': 'DIY Boxes (Cajas Manualidades / DIY)',
  'shipping-box-dielines': 'Shipping Boxes (Cajas de Envío)',
  'mailer-box-dielines': 'Mailer Boxes (Cajas E-Commerce)',
  'food-box-dielines': 'Food (Alimentación y Pastelería)',
  'toy-packaging-dielines': 'Toys (Juguetes)',
  'coffee-packaging-dielines': 'Coffee (Café e Infusiones)',
  'tobacco-product-packaging-dielines': 'Tobacco (Estuches de Tabaco)',
  'personal-care-packaging-dielines': 'Personal Care (Cosmética y Cuidado)',
  'beverage-packaging-dielines': 'Beverage (Bebidas y Botellas)',
  'office-product-packaging-dielines': 'Office (Papelería y Oficina)',
  'barbie-box-templates': 'Barbie Box (Cajas Muñecas / Colección)',
  'candy-box-dielines': 'Candies (Dulces y Bombones)',
  'medicine-packaging-dielines': 'Medicine (Farmacia y Salud)',
  'alcohol-packaging-dielines': 'Alcohol (Vinos y Licores)',
  'milk-yogurt-packaging-dielines': 'Milk & Yogurt (Lácteos)'
};

(async () => {
  console.log('1. Obteniendo árbol oficial de categorías (By Models / By Uses) de Pacdora...');
  const ctreeRes = await requestPacdora('/api/v2/models/ctree?complexType=0');
  const byModelsRaw = ctreeRes.json.data.find(x => x.nameKey === 'By Models').children;
  const byUsesRaw = ctreeRes.json.data.find(x => x.nameKey === 'By Uses').children;

  // Cargar modelos FEFCO existentes si ya están en assets/fefco-catalog.js para reutilizar su knifeData inmediatamente
  const existingKnifeById = new Map();
  const fefcoFile = path.join(process.cwd(), 'assets', 'fefco-catalog.js');
  if (fs.existsSync(fefcoFile)) {
    try {
      const txt = fs.readFileSync(fefcoFile, 'utf8');
      const jsonStart = txt.indexOf('[');
      const jsonEnd = txt.lastIndexOf(']');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const arr = JSON.parse(txt.slice(jsonStart, jsonEnd + 1));
        for (const item of arr) {
          if (item && item.id && item.knifeData) {
            existingKnifeById.set(Number(item.id), compactKnifeData(item.knifeData));
          }
        }
        console.log(`Reutilizados ${existingKnifeById.size} modelos desde assets/fefco-catalog.js`);
      }
    } catch (e) {
      console.warn('No se pudo pre-cargar fefco-catalog.js:', e.message);
    }
  }

  // Cargar caché previa si existe
  let cacheObj = { modelsMeta: [], knifeById: {} };
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cacheObj = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      console.log(`Caché detectada con ${Object.keys(cacheObj.knifeById || {}).length} geometrías descargadas.`);
    } catch (e) {}
  }
  for (const [id, kd] of existingKnifeById.entries()) {
    cacheObj.knifeById[id] = kd;
  }

  if (!cacheObj.modelsMeta || cacheObj.modelsMeta.length < 2148) {
    console.log('2. Descargando listado completo de los 2,148 modelos de https://www.pacdora.com/dielines ...');
    const allMeta = [];
    for (let p = 1; p <= 22; p++) {
      const r = await requestPacdora(`/api/v2/models?pageSize=100&current=${p}&complexType=0`);
      if (r.json && r.json.data) {
        allMeta.push(...r.json.data);
      }
      process.stdout.write(`Pág ${p}/22 (${allMeta.length}) `);
    }
    console.log(`\nTotal modelos obtenidos: ${allMeta.length}`);
    cacheObj.modelsMeta = allMeta;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj));
  }

  const allMeta = cacheObj.modelsMeta;
  let cookie = await getExperienceCookie();

  const missing = allMeta.filter(m => !cacheObj.knifeById[m.id]);
  console.log(`3. Extrayendo geometría vectorial 1:1 mm (knifeData) para ${missing.length} modelos restantes...`);

  const CONCURRENCY = 22;
  let completed = 0;
  let failed = 0;
  const startTime = Date.now();

  async function fetchOneKnife(m, attempt = 1) {
    try {
      const kr = await requestPacdora('/api/v2/project/knife', 'POST', { Cookie: cookie }, {
        post_dto: {
          id: Number(m.id),
          export_type: 'model',
          window_mode: 'base',
          size_type: 'dm',
          length: Number(m.length) || 200,
          width: Number(m.width) || 150,
          height: Number(m.height) || 100,
          thickness: 1.5,
          bleed: 0,
          openParams: {}
        }
      });

      if (kr.json && kr.json.code === 401 && attempt <= 2) {
        cookie = await getExperienceCookie();
        return fetchOneKnife(m, attempt + 1);
      }

      const layer = extractBestLayer(kr.json?.data?.layer);
      if (layer) {
        cacheObj.knifeById[m.id] = compactKnifeData(layer);
        return true;
      } else if (attempt <= 2) {
        await new Promise(r => setTimeout(r, 250));
        return fetchOneKnife(m, attempt + 1);
      }
      return false;
    } catch (err) {
      if (attempt <= 2) {
        await new Promise(r => setTimeout(r, 300));
        return fetchOneKnife(m, attempt + 1);
      }
      return false;
    }
  }

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(m => fetchOneKnife(m)));
    for (const ok of results) {
      if (ok) completed++;
      else failed++;
    }
    if ((i / CONCURRENCY) % 10 === 0 || i + CONCURRENCY >= missing.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const totalDone = Object.keys(cacheObj.knifeById).length;
      console.log(`  Progreso: ${totalDone}/${allMeta.length} geometrías listas (${elapsed}s, fallos: ${failed})`);
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj));
    }
  }

  console.log('4. Organizando los 2,148 modelos exactamente como en https://www.pacdora.com/dielines ...');

  const byModelsCategories = byModelsRaw.map(c => ({
    id: c.id,
    slug: c.dielineNameKey || c.nameKey,
    name: c.name,
    labelEs: SPANISH_BY_MODELS[c.dielineNameKey] || c.name,
    count: c.count,
    group: 'byModels'
  }));

  const byUsesCategories = byUsesRaw.map(c => ({
    id: c.id,
    slug: c.dielineNameKey || c.nameKey,
    name: c.name,
    labelEs: SPANISH_BY_USES[c.dielineNameKey] || c.name,
    count: c.count,
    group: 'byUses'
  }));

  // Clasificar cada uno de los 2,148 modelos en todas sus categorías By Models y By Uses
  // y asignarle una categoría primaria de archivo para que cada modelo se guarde una sola vez en disco
  const MAX_MODELS_PER_PART = 120;
  const buckets = new Map(); // primarySlug -> array of full model objects

  for (const c of byModelsCategories) buckets.set(c.slug, []);
  buckets.set('use-exclusive-dielines', []);

  const indexModels = [];

  for (const m of allMeta) {
    const classStr = `${m.class1 || ''}${m.class2 || ''}${m.class3 || ''}`;
    const matchedModelsSlugs = byModelsCategories
      .filter(c => classStr.includes(`(${c.id})`))
      .map(c => c.slug);

    const matchedUsesSlugs = byUsesCategories
      .filter(c => classStr.includes(`(${c.id})`))
      .map(c => c.slug);

    // Determinar código FEFCO si aplica
    const fefcoMatch = (m.name || '').match(/FEFCO\s*(\d{4})/i);
    const fefcoCode = fefcoMatch ? `FEFCO ${fefcoMatch[1]}` : '';
    const fefcoDigits = fefcoMatch ? fefcoMatch[1] : '';

    // Categoría primaria donde residirá su archivo de geometría
    const primarySlug = matchedModelsSlugs[0] || 'use-exclusive-dielines';

    const cleanEntry = {
      id: m.id,
      num: m.num,
      cateId: m.cateId || m.cate_id,
      fefcoCode,
      fefcoDigits,
      name: (m.showName || m.name || `Model #${m.num}`).trim(),
      dielineName: (m.name || '').trim(),
      length: Number(m.length) || 200,
      width: Number(m.width) || 150,
      height: Number(m.height) || 100,
      thickness: 1.5,
      image: m.image || '',
      knifePreview: m.knife || '',
      modelCategories: matchedModelsSlugs,
      useCategories: matchedUsesSlugs,
      knifeData: cacheObj.knifeById[m.id] || null
    };

    buckets.get(primarySlug).push(cleanEntry);
  }

  // 5. Escribir los archivos modulares por categoría (dividiendo en partes si superan MAX_MODELS_PER_PART para no hacer archivos pesados)
  const shardManifest = {}; // fileKey -> filename
  const modelToShard = {};  // model.num -> fileKey

  for (const [slug, items] of buckets.entries()) {
    if (items.length === 0) continue;
    const totalParts = Math.ceil(items.length / MAX_MODELS_PER_PART);

    for (let part = 0; part < totalParts; part++) {
      const slice = items.slice(part * MAX_MODELS_PER_PART, (part + 1) * MAX_MODELS_PER_PART);
      const shardKey = totalParts === 1 ? slug : `${slug}-p${part + 1}`;
      const fileName = `${shardKey}.js`;
      const filePath = path.join(OUT_DIR, fileName);

      shardManifest[shardKey] = `assets/pacdora-catalog/${fileName}`;

      for (const item of slice) {
        modelToShard[item.num] = shardKey;
        indexModels.push({
          id: item.id,
          num: item.num,
          fefcoCode: item.fefcoCode,
          fefcoDigits: item.fefcoDigits,
          name: item.name,
          length: item.length,
          width: item.width,
          height: item.height,
          thickness: item.thickness,
          image: item.image,
          knifePreview: item.knifePreview,
          facesCount: item.knifeData && item.knifeData.faces ? item.knifeData.faces.length : 0,
          modelCategories: item.modelCategories,
          useCategories: item.useCategories,
          shard: shardKey
        });
      }

      const fileContent = [
        `/**`,
        ` * CATÁLOGO PACDORA DIELINES — Categoría: ${shardKey} (${slice.length} modelos)`,
        ` * Escala 1:1 en milímetros (mm)`,
        ` */`,
        `window.PACDORA_CATALOG_SHARDS = window.PACDORA_CATALOG_SHARDS || {};`,
        `window.PACDORA_CATALOG_SHARDS[${JSON.stringify(shardKey)}] = ${JSON.stringify(slice)};`
      ].join('\n');

      fs.writeFileSync(filePath, fileContent, 'utf8');
      const sizeKB = (Buffer.byteLength(fileContent, 'utf8') / 1024).toFixed(1);
      console.log(`  -> Creado ${fileName.padEnd(42)} (${String(slice.length).padStart(3)} modelos | ${sizeKB.padStart(7)} KB)`);
    }
  }

  // Ordenar indexModels manteniendo el orden original de Pacdora allMeta
  const orderMap = new Map();
  allMeta.forEach((m, idx) => orderMap.set(m.num, idx));
  indexModels.sort((a, b) => (orderMap.get(a.num) ?? 0) - (orderMap.get(b.num) ?? 0));

  // Escribir índice maestro ligero: assets/pacdora-catalog/catalog-index.js
  const indexPayload = {
    totalModels: indexModels.length,
    generatedAt: new Date().toISOString(),
    sourceUrl: 'https://www.pacdora.com/dielines',
    byModels: byModelsCategories,
    byUses: byUsesCategories,
    shards: shardManifest,
    models: indexModels
  };

  const indexFileContent = [
    `/**`,
    ` * ÍNDICE MAESTRO DE LOS 2,148 MODELOS DE PACDORA (https://www.pacdora.com/dielines)`,
    ` * Organizado exactamente según la estructura oficial de la web:`,
    ` *  - By Models (21 categorías de estructura de caja/troquel)`,
    ` *  - By Uses (16 categorías por sector/aplicación)`,
    ` * Los datos geométricos pesados (knifeData) están distribuidos en archivos modulares bajo demanda.`,
    ` */`,
    `window.PACDORA_CATALOG_INDEX = ${JSON.stringify(indexPayload)};`
  ].join('\n');

  const indexFilePath = path.join(OUT_DIR, 'catalog-index.js');
  fs.writeFileSync(indexFilePath, indexFileContent, 'utf8');
  console.log(`\nÍndice maestro generado: assets/pacdora-catalog/catalog-index.js (${(Buffer.byteLength(indexFileContent) / 1024).toFixed(1)} KB)`);

  // Eliminar caché temporal pesada para dejar limpio el proyecto
  if (fs.existsSync(CACHE_FILE)) {
    fs.unlinkSync(CACHE_FILE);
    console.log('Archivo temporal _raw_cache_2148.json eliminado.');
  }

  console.log('¡Extracción y distribución completadas con éxito!');
})();
