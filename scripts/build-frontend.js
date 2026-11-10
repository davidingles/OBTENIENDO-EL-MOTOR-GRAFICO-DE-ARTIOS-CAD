const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'web-dist');
fs.mkdirSync(output, {recursive: true});
for (const file of ['index.html', 'styles.css', 'app.js', 'dieline-engine.js', 'cad-io.js', 'artwork-layout.js', 'library-models.js', 'artios-assets.js']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), {recursive: true});
console.log('Interfaz y catálogo preparados para Tauri.');
