# TROQUELES VICENTE · Estudio local de troqueles 2D y 3D

Editor de packaging con catálogo y texturas almacenados en este proyecto. La aplicación, el servidor y los cálculos funcionan en el equipo local; no utilizan servicios externos.

## Inicio

Ejecuta `iniciar_motor_3d.bat` o ejecuta `node server.js` y abre http://localhost:8080. El servidor escucha únicamente en el propio equipo. Si ya estaba iniciado antes de actualizar, ciérralo y vuelve a iniciarlo para cargar el servidor local actual.

## Funcionamiento

- Los modelos y sus geometrías base se cargan de los archivos incluidos en `assets`. También se pueden abrir archivos SVG locales.
- El redimensionado y los ajustes de solapas usan deformación geométrica local por bandas. La banda modifica todas las líneas y caras que atraviesa, por lo que puede cambiar piezas vecinas. Las fórmulas originales de cada diseño no están incluidas; el resultado no equivale necesariamente a un cálculo estructural exacto.
- La interfaz usa únicamente milímetros y las exportaciones no incluyen sangrado.
- En las parejas de piezas compatibles, la casilla de simetría vincula sus medidas.
- Las dimensiones interiores y exteriores se estiman usando los ajustes del material y su espesor. Son aproximaciones.
- Los proyectos se guardan en el almacenamiento del navegador; no incluyen el arte cargado.
- Las variaciones de piezas son experimentales. Verifica los planos y las medidas antes de fabricar.
- Se pueden exportar SVG, DXF, PDF, GLB y PNG. El formato AI nativo no está implementado; PDF y SVG se pueden abrir en Illustrator.

El antiguo extractor de catálogo remoto está desactivado.
