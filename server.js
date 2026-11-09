/**
 * SERVIDOR LOCAL ARTIOSCAD 3D + PROXY SOLVER PARAMÉTRICO FEFCO (PACDORA API)
 * Sirve la aplicación en http://localhost:8080 y expone el endpoint POST /api/pacdora/knife
 * para recalcular cualquier modelo FEFCO con medidas personalizadas (Largo × Ancho × Alto × Espesor).
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = process.cwd();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.csv': 'text/csv',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml'
};

let cachedPacdoraCookie = null;
let cookieExpireAt = 0;

function requestPacdora(urlPath, method = 'GET', headers = {}, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const payload = bodyObj ? JSON.stringify(bodyObj) : null;
    const req = https.request({
      hostname: 'www.pacdora.com',
      path: urlPath,
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.pacdora.com/dielines/fefco-box-templates',
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
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getExperienceCookie() {
  if (cachedPacdoraCookie && Date.now() < cookieExpireAt) {
    return cachedPacdoraCookie;
  }
  const exp = await requestPacdora('/api/v2/users/experience_user', 'GET');
  const map = new Map();
  for (const c of (exp.headers['set-cookie'] || [])) {
    const kv = c.split(';')[0];
    const eq = kv.indexOf('=');
    if (eq > 0) map.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
  }
  cachedPacdoraCookie = Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  cookieExpireAt = Date.now() + 1000 * 60 * 60 * 6; // 6 hours
  return cachedPacdoraCookie;
}

function extractBestLayer(layerObj) {
  if (!layerObj || typeof layerObj !== 'object') return null;
  if (layerObj.traditional && Array.isArray(layerObj.traditional.faces) && layerObj.traditional.faces.length > 0) {
    return layerObj.traditional;
  }
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

http.createServer(async (req, res) => {
  // Endpoint de recálculo paramétrico en vivo contra el motor FEFCO / Pacdora (2,148 modelos)
  if (req.method === 'POST' && req.url.startsWith('/api/pacdora/knife')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const params = JSON.parse(body || '{}');
        const cookie = await getExperienceCookie();
        const sizeType = ['dm', 'id', 'ed'].includes(params.size_type) ? params.size_type : 'dm';
        const bleedVal = params.bleed !== undefined ? Number(params.bleed) : 5;
        const openParamsObj = (params.openParams && typeof params.openParams === 'object') ? params.openParams : {};

        const apiRes = await requestPacdora('/api/v2/project/knife', 'POST', { Cookie: cookie }, {
          post_dto: {
            id: Number(params.id),
            export_type: 'model',
            window_mode: 'base',
            size_type: sizeType,
            length: Number(params.length) || 250,
            width: Number(params.width) || 180,
            height: Number(params.height) || 120,
            thickness: Number(params.thickness) || 1.5,
            bleed: bleedVal,
            openParams: openParamsObj
          }
        });

        const apiData = apiRes.json?.data || {};
        const trad = extractBestLayer(apiData.layer);
        if (!trad) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Sin geometría devuelta por el solver remoto' }));
        }

        const knifeData = {
          width: trad.width,
          height: trad.height,
          faces: trad.faces || [],
          holes: trad.holes || [],
          cuts: trad.cuts || [],
          bleeds: trad.bleeds || [],
          folds: trad.folds || [],
          sizeArrowData: trad.sizeArrowData || [],
          outsideArrowData: trad.outsideArrowData || [],
          animations: (trad.animation && trad.animation.animations) || trad.animations || [],
          openParams: apiData.openParams || [],
          size: apiData.size || null,
          outSize: apiData.outSize || null,
          knifeSize: apiData.knifeSize || null,
          bleedMm: bleedVal
        };

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, knifeData }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Servidor de archivos estáticos
  const cleanUrl = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, cleanUrl === '/' ? 'index.html' : cleanUrl);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Servidor CAD 3D + 116 FEFCO Paramétrico activo en http://localhost:${PORT}`);
});
