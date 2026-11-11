'use strict';
const { execFile } = require('node:child_process');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { modelFilename, VIEWER_URL } = require('../client-publishing');
const REPO = 'repos/davidingles/cajas_threejs-01';

function ghApi(method, endpoint, input) {
  const args = ['api', '--hostname', 'github.com', '--include', '--jq', '{default_branch,sha,type,commit:{sha:.commit.sha}}', '--method', method, endpoint];
  if (input) args.push('--input', input);
  const gh = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI', 'gh.exe') : 'gh';
  return new Promise((resolve, reject) => {
    execFile(gh, args, { windowsHide: true, timeout: 120000, maxBuffer: 1000000,
      env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_HOST: 'github.com' } }, (error, stdout) => {
      const status = Number(/^HTTP\/\S+ (\d+)/.exec(stdout)?.[1]);
      if (!status) return reject(new Error('Inicia sesión en GitHub desde PowerShell: gh auth login --hostname github.com --web --git-protocol https'));
      try { resolve({ status, body: JSON.parse(stdout.split(/\r?\n\r?\n/).slice(1).join('\n\n')) }); }
      catch (_) { reject(new Error('GitHub devolvió una respuesta no válida. Comprueba la conexión.')); }
    });
  });
}

async function publishModel({ filename, data }, request = ghApi) {
  filename = modelFilename(filename);
  if (!Buffer.isBuffer(data) || data.length < 12 || data.length > 20000000 || data.toString('ascii', 0, 4) !== 'glTF' || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) {
    throw new Error('El archivo debe ser un GLB válido y no superar 20 MB.');
  }
  const repo = await request('GET', REPO);
  if (repo.status !== 200 || !repo.body.default_branch) throw new Error('No se puede acceder al repositorio. Comprueba tu cuenta y sus permisos.');
  const branch = repo.body.default_branch;
  const endpoint = `${REPO}/contents/modelos/${filename}`;
  const current = await request('GET', `${endpoint}?ref=${encodeURIComponent(branch)}`);
  if (current.status === 200) throw new Error('Ya existe una caja con esa clave. Elige otro nombre para no sustituirla.');
  if (current.status !== 404) throw new Error('No se pudo comprobar la clave en GitHub. Inténtalo de nuevo.');
  const directory = await mkdtemp(path.join(tmpdir(), 'troqueles-publish-'));
  try {
    const input = path.join(directory, 'upload.json');
    await writeFile(input, JSON.stringify({ message: `Publicar caja ${filename}`, branch, content: data.toString('base64') }));
    const response = await request('PUT', endpoint, input);
    if (response.status !== 201) throw new Error(response.status === 409 || response.status === 422 ? 'La clave ya existe o cambió el repositorio. Prueba con otro nombre.' : 'GitHub no aceptó la subida. Comprueba la conexión y los permisos de escritura.');
    return { filename, key: filename.slice(0, -4), url: VIEWER_URL, commit: response.body.commit?.sha };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
module.exports = { publishModel, ghApi };
