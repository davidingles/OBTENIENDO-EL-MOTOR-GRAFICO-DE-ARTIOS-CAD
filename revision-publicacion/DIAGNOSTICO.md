# Publicación para clientes

Comprobado el 13 de noviembre de 2026.

- El menú `menu-publish-client` delegaba en `btn-publish-client`, que no existe en `index.html`. El formulario nunca se abría. La app local ya conecta el menú directamente al formulario, con pruebas basadas en los identificadores reales del HTML.
- La sesión local de GitHub CLI de `davidingles` funciona y tiene permiso de escritura en `davidingles/cajas_threejs-01`. GitHub Pages indica `built`, desde `main:/`. No hace falta entregar contraseñas ni copiar tokens.
- El publicador permite crear modelos nuevos en `modelos/`, sin sustituir claves existentes, con límite de 20 MB. No se ha subido ningún modelo durante este diagnóstico.
- El visor remoto tiene `_setupAnimations`, pero `loadModel` no la llama ni notifica `hasAnimations`; además `_tick` no actualiza el mezclador. Esto impide activar y reproducir el plegado aunque el GLB incluya animaciones.

## Corrección web aplicada

`visor/viewer.js` contiene la corrección del visor, preparada contra el archivo remoto `js/viewer.js`, SHA `4023da16097b07dead0205378e96bc619b91be1a`. Conecta los clips al cargar el GLB, comunica su existencia al formulario y actualiza el mezclador durante la reproducción. Verificar de nuevo el SHA antes de aplicarla para no sobrescribir cambios posteriores.

Origen: https://github.com/davidingles/cajas_threejs-01/blob/main/js/viewer.js

Con la confirmación de que los modelos pueden ser públicos, se aplicó la reparación del visor en el commit `656afc9ff1b5ca155f4d5d41fb86b16c78fb4ef4`. Se corrigió además el cálculo del encuadre horizontal para pantallas estrechas en `5c6e5e21cf9c3a916fed00cdec283b51756a9fdd`.

Tras autorización expresa del usuario para el archivo y destino, se publicó `modelos/prueba_armadura_90_20261113.glb` usando el mismo módulo de publicación de la app, commit `61f4cfe08dd245ad3df416ab5924152f816906ee`. Es una caja del catálogo sin arte de clientes, con una malla y armadura a 90 grados. La clave para cargarla es `prueba_armadura_90_20261113`. No se han sustituido otros modelos.

GitHub Pages confirmó el despliegue final `edf164d047425649b81b23d51f8549f88d63aaf3`, que también actualiza las versiones de caché de los módulos. Se verificó en el navegador real: formulario inicial sin modelo, carga por nombre, aviso para un nombre inexistente, movimiento del plegado y caja completa en el canvas estrecho. Captura: `../../visor-cliente-verificado.jpg` desde la raíz del proyecto. El archivo `js/main.js` desplegado se conserva en `visor/main.js` para probar el flujo por nombre sin depender de un directorio de compilación ausente.

## Acceso

Los modelos y el arte subidos a este repositorio son públicos. La clave es el nombre de archivo, no una contraseña. Si se necesita acceso privado por cliente hay que cambiar el almacenamiento y añadir autenticación; no basta con ocultar el enlace en GitHub Pages.
