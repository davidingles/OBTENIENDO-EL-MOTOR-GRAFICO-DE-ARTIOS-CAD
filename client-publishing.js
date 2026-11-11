(function (root) {
  'use strict';
  const VIEWER_URL = 'https://davidingles.github.io/cajas_threejs-01/';
  function modelFilename(value) {
    const name = String(value || '').trim().replace(/\.glb$/i, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(name)) {
      throw new Error('Usa entre 1 y 80 letras sin acentos, números, guiones o guiones bajos.');
    }
    return name + '.glb';
  }
  const api = { VIEWER_URL, modelFilename };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClientPublishing = api;
})(typeof window === 'object' ? window : globalThis);
