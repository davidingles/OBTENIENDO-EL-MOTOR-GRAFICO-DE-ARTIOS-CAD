const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { modelFilename } = require('../client-publishing');
const { publishModel } = require('../desktop/github-publish');

function glb() { const data = Buffer.alloc(12); data.write('glTF'); data.writeUInt32LE(2, 4); data.writeUInt32LE(12, 8); return data; }
test('las claves aceptan extensión opcional y rechazan rutas y nombres ambiguos', () => {
  assert.equal(modelFilename(' Cliente_12.GLB '), 'Cliente_12.glb');
  assert.equal(modelFilename('cliente-12'), 'cliente-12.glb');
  for (const value of ['', '../otro', '/otro', 'a.glb.glb', 'a?x', 'cajá', 'con espacios', '-cliente', 'x'.repeat(81)]) assert.throws(() => modelFilename(value));
});
test('publicar crea el archivo en modelos y elimina el archivo temporal', async () => {
  const calls = []; let temporary;
  const result = await publishModel({ filename: 'cliente01', data: glb() }, async (method, endpoint, input) => {
    calls.push([method, endpoint]);
    if (calls.length === 1) return { status: 200, body: { default_branch: 'main' } };
    if (calls.length === 2) return { status: 404, body: {} };
    temporary = input;
    const payload = JSON.parse(await fs.readFile(input, 'utf8'));
    assert.equal(payload.branch, 'main'); assert.equal(Buffer.from(payload.content, 'base64').toString('hex'), glb().toString('hex'));
    assert.equal(payload.sha, undefined);
    return { status: 201, body: { commit: { sha: 'commit' } } };
  });
  assert.deepEqual(calls.map(c => c[0]), ['GET', 'GET', 'PUT']);
  assert.equal(calls[2][1], 'repos/davidingles/cajas_threejs-01/contents/modelos/cliente01.glb');
  assert.equal(result.key, 'cliente01');
  await assert.rejects(fs.access(temporary));
});
test('no sustituye claves existentes ni publica cuando GitHub no permite comprobarlas', async () => {
  for (const status of [200, 403, 500]) {
    const calls = [];
    await assert.rejects(publishModel({ filename: 'cliente', data: glb() }, async method => {
      calls.push(method); return calls.length === 1 ? { status: 200, body: { default_branch: 'main' } } : { status, body: {} };
    }));
    assert.deepEqual(calls, ['GET', 'GET']);
  }
});
test('un GLB inválido no inicia solicitudes a GitHub', async () => {
  let calls = 0;
  const invalid = glb(); invalid.writeUInt32LE(999, 8);
  await assert.rejects(publishModel({ filename: 'cliente', data: invalid }, async () => { calls++; }));
  assert.equal(calls, 0);
});
test('una subida rechazada no informa de éxito y limpia su temporal', async () => {
  let calls = 0, temporary;
  await assert.rejects(publishModel({ filename: 'cliente', data: glb() }, async (_, __, input) => {
    calls++;
    if (calls === 1) return { status: 200, body: { default_branch: 'main' } };
    if (calls === 2) return { status: 404, body: {} };
    temporary = input;
    return { status: 422, body: {} };
  }), /clave ya existe/);
  await assert.rejects(fs.access(temporary));
});
