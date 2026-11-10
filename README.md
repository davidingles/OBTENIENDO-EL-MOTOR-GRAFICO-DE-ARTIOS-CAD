# TROQUELES VICENTE · Estudio local de troqueles 2D y 3D

Editor de packaging con catálogo y texturas almacenados en este proyecto. La aplicación, el servidor y los cálculos funcionan en el equipo local; no utilizan servicios externos.

## Inicio

Abre `dist/Troqueles-Vicente-Tauri-v2.exe`: aplicación de escritorio Tauri v2 con ventana propia, catálogo y recursos integrados, sin servidor local ni Node.js para ejecutarla. Las exportaciones abren el diálogo nativo «Guardar como». Requiere Microsoft Edge WebView2 Runtime. El ejecutable anterior que abría el navegador queda sustituido por esta versión.

Para compilar: instala Rust con las herramientas de C++ de Visual Studio y Node.js, ejecuta `npm ci` y después `desktop/build.ps1`. También puedes ejecutar `npm run desktop:build`; el binario se genera en `src-tauri/target/release/troqueles-vicente.exe`. Configuración basada en la [documentación oficial de Tauri v2](https://v2.tauri.app/reference/config/).

Ejecuta `iniciar_motor_3d.bat` o ejecuta `node server.js` y abre http://localhost:8080. El servidor escucha únicamente en el propio equipo. Si ya estaba iniciado antes de actualizar, ciérralo y vuelve a iniciarlo para cargar el servidor local actual.

## Funcionamiento

- Al abrir o centrar un modelo, el troquel 2D ocupa como máximo el 75 % del espacio libre del plano; tiene en cuenta el tamaño actual del panel 3D. El zoom manual permite ampliarlo después.
- La biblioteca muestra planos completos sobre blanco y vistas 3D generadas con la geometría de cada modelo. Las miniaturas se cargan al entrar en la zona visible y comparten un único renderizador 3D.
- Los modelos y sus geometrías base se cargan de los archivos incluidos en `assets`. También se pueden abrir archivos SVG locales.
- El redimensionado y los ajustes de solapas usan deformación geométrica local por bandas. La banda modifica todas las líneas y caras que atraviesa, por lo que puede cambiar piezas vecinas. Las fórmulas originales de cada diseño no están incluidas; el resultado no equivale necesariamente a un cálculo estructural exacto.
- La interfaz usa únicamente milímetros y las exportaciones no incluyen sangrado.
- Las piezas simétricas comparten un único campo en Detalles; se comprueban su contorno y sus huecos. Las piezas distintas conservan sus medidas independientes.
- Material ofrece tres acabados: blanco/blanco, blanco/marrón y marrón/marrón. El espesor se ajusta aparte.
- Asa, uñero y pestaña de cierre tienen una ventana de medidas con deslizadores en tiempo real. El asa permite ancho, largo y radio; el uñero, uno o dos recortes, radio y distancia entre centros. Los huecos y las muescas modifican la malla 3D. La pestaña añade una cara articulada y sustituye el corte de unión por un hendido.
- Las dimensiones interiores y exteriores se estiman usando los ajustes del material y su espesor. Son aproximaciones.
- Los proyectos se guardan en el almacenamiento local de la aplicación; no incluyen el arte cargado. Los guardados de la antigua versión del navegador no se importan automáticamente a Tauri.
- Las variaciones de piezas son experimentales. Verifica los planos y las medidas antes de fabricar.
- Se pueden exportar SVG, DXF, PDF, GLB y PNG. El formato AI nativo no está implementado; PDF y SVG se pueden abrir en Illustrator.

El antiguo extractor de catálogo remoto está desactivado.
