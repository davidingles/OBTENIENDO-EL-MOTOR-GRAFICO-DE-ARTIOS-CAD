/** Servidor local del estudio. La publicación explícita de cajas utiliza GitHub. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const { publishModel } = require('./desktop/github-publish');
let publishing = false;
async function handlePublication(req, res) {
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  // Only the same-origin local editor may trigger a write to GitHub.
  if (req.headers.host !== `localhost:${PORT}` && req.headers.host !== `127.0.0.1:${PORT}`) return json(403, { error: 'Origen no permitido' });
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: 'Origen no permitido' });
  if (req.headers['content-type'] !== 'application/json') return json(415, { error: 'Se requiere JSON' });
  if (publishing) return json(409, { error: 'Ya hay una publicación en curso.' });
  publishing = true;
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 85000000) { json(413, { error: 'El modelo supera el tamaño permitido.' }); return; }
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(body.data) || body.data.length > 20000000 || body.data.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return json(400, { error: 'Datos GLB no válidos.' });
    json(201, await publishModel({ filename: body.filename, data: Buffer.from(body.data) }));
  } catch (error) { json(400, { error: error.message || 'No se pudo publicar.' }); }
  finally { publishing = false; }
}
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.png': 'image/png', '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8'
};
http.createServer((req, res) => {
  if (req.url === '/api/publish-client-model' && req.method === 'POST') return handlePublication(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Método no permitido');
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (_) { res.writeHead(400); return res.end('Ruta inválida'); }
  const filePath = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end('Acceso denegado');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Estudio local disponible en http://localhost:${PORT}`));
