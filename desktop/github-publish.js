'use strict';
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const { mkdtemp, writeFile, rm, mkdir } = require('node:fs/promises');
const { tmpdir, homedir } = require('node:os');
const path = require('node:path');
const { modelFilename, VIEWER_URL } = require('../client-publishing');
const REPO = 'repos/davidingles/cajas_threejs-01';

function findLocalRepo() {
  const candidates = [
    path.join(homedir(), 'Desktop', 'CAJAS_THREEJS-01'),
    path.resolve(__dirname, '../../CAJAS_THREEJS-01')
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
  }
  return null;
}

function runGit(repoDir, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: repoDir, windowsHide: true, timeout: 60000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr.trim() || stdout.trim() || err.message));
      resolve(stdout.trim());
    });
  });
}

async function publishViaLocalGit({ filename, data }, repoDir) {
  const modelsDir = path.join(repoDir, 'modelos');
  await mkdir(modelsDir, { recursive: true });
  const targetFile = path.join(modelsDir, filename);
  if (fs.existsSync(targetFile)) {
    throw new Error('Ya existe una caja con esa clave. Elige otro nombre para no sustituirla.');
  }
  await writeFile(targetFile, data);
  try {
    await runGit(repoDir, ['add', `modelos/${filename}`]);
    await runGit(repoDir, ['commit', '-m', `Publicar caja ${filename}`]);
    await runGit(repoDir, ['push', 'origin', 'main']);
    const commit = await runGit(repoDir, ['rev-parse', 'HEAD']);
    const key = filename.slice(0, -4);
    return {
      filename,
      key,
      url: `${VIEWER_URL}?caja=${encodeURIComponent(key)}`,
      commit
    };
  } catch (err) {
    try { await rm(targetFile, { force: true }); } catch (_) {}
    throw new Error(`Error al subir al repositorio con git: ${err.message}`);
  }
}

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

  // Si se usa el handler por defecto (producción/servidor local), intentamos primero git local
  if (request === ghApi) {
    const localRepo = findLocalRepo();
    if (localRepo) {
      try {
        return await publishViaLocalGit({ filename, data }, localRepo);
      } catch (err) {
        if (err.message.includes('Ya existe una caja con esa clave')) throw err;
        // Si git local falla por alguna razón (ej. remoto bloqueado), registramos y probamos ghApi
      }
    }
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
    const key = filename.slice(0, -4);
    return { filename, key, url: `${VIEWER_URL}?caja=${encodeURIComponent(key)}`, commit: response.body.commit?.sha };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
module.exports = { publishModel, ghApi, findLocalRepo, publishViaLocalGit };
