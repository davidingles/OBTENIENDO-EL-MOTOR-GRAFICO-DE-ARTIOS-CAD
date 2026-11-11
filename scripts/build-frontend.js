const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'web-dist');
fs.mkdirSync(output, {recursive: true});
for (const file of ['index.html', 'styles.css', 'app.js', 'client-publishing.js', 'dieline-engine.js', 'cad-io.js', 'artwork-layout.js', 'library-models.js', 'vector-cad.js', 'artios-assets.js']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
// Copy files individually: on Windows cpSync can fail when the destination
// directory already exists even though its files are writable.
function copyDirectory(source, destination) {
  fs.mkdirSync(destination, {recursive: true});
  for (const entry of fs.readdirSync(source, {withFileTypes: true})) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) {
      if (fs.existsSync(to)) fs.chmodSync(to, 0o666);
      fs.copyFileSync(from, to);
    }
  }
}
copyDirectory(path.join(root, 'assets'), path.join(output, 'assets'));
console.log('Interfaz y catálogo preparados para Tauri.');
