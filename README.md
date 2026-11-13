# TROQUELES VICENTE · Estudio local de troqueles 2D y 3D

Editor de packaging con catálogo y texturas almacenados en este proyecto. La aplicación, el servidor y los cálculos funcionan en el equipo local; no utilizan servicios externos.

## Inicio

Abre `dist/Troqueles-Vicente-Tauri-v2.exe`: aplicación de escritorio Tauri v2 con ventana propia, catálogo y recursos integrados, sin servidor local ni Node.js para ejecutarla. Las exportaciones abren el diálogo nativo «Guardar como». Requiere Microsoft Edge WebView2 Runtime. El ejecutable anterior que abría el navegador queda sustituido por esta versión.

Para compilar: instala Rust con las herramientas de C++ de Visual Studio y Node.js, ejecuta `npm ci` y después `desktop/build.ps1`. También puedes ejecutar `npm run desktop:build`; el binario se genera en `src-tauri/target/release/troqueles-vicente.exe`. Configuración basada en la [documentación oficial de Tauri v2](https://v2.tauri.app/reference/config/).

Ejecuta `iniciar_motor_3d.bat` o ejecuta `node server.js` y abre http://localhost:8080. El servidor escucha únicamente en el propio equipo. Si ya estaba iniciado antes de actualizar, ciérralo y vuelve a iniciarlo para cargar el servidor local actual.

## Funcionamiento

- «CREAR .blend» es únicamente un botón sin acción asociada.
- Se pueden abrir SVG y DXF ASCII. Al abrir DXF se confirma la escala y la clasificación de grupos como corte, hendido o ignorar. Admite LINE, ARC, CIRCLE, LWPOLYLINE/POLYLINE con bulges, ELLIPSE, splines con nudos y puntos de control, y bloques INSERT 2D. Los formatos no compatibles se notifican; DWG y DXF binario no se importan de forma nativa. Referencia: [grupos DXF de Autodesk](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-89CB823D-614D-4D1E-8204-568EC72DF869.htm).
- Tras importar CAD, selecciona el panel de la base y usa «Usar panel seleccionado como base 3D» en Más si necesitas cambiarlo. El plegado requiere contornos cerrados y uniones de hendido entre paneles.
- «Arte» carga una imagen exterior, muestra su ajuste sobre el plano y permite posición, escala proporcional, giro y reflexión. Puede aplicarse a todo el troquel o a la cara seleccionada. Se incluye como textura en GLB; el interior conserva su material. El tamaño máximo del atlas de textura es 2048 px por lado.
- También puedes copiar una imagen al portapapeles y pulsar Ctrl + V sobre el plano: se carga como arte y se abren sus controles de ajuste. Sustituye la imagen de arte actual, igual que al cargar un archivo. Pegar texto en los campos de edición sigue funcionando normalmente.
- GLB exporta una única malla con todos los paneles y núcleos de hendido, conservando materiales, UV e imágenes. El plegado utiliza siempre una armadura jerárquica con pesos rígidos por panel, sin shape keys. En Blender se importa una malla y una armadura. Cada área móvil completa un giro local de 90° respecto a su padre; la base permanece fija. La geometría se convierte de milímetros a metros sin alterar la escala del visor. Esta misma política se aplica al GLB para clientes y al generar la escena .blend.
- Al abrir o centrar un modelo, el troquel 2D ocupa como máximo el 75 % del espacio libre del plano; tiene en cuenta el tamaño actual del panel 3D. El zoom manual permite ampliarlo después.
- La biblioteca muestra planos completos sobre blanco y vistas 3D generadas con la geometría de cada modelo. Las miniaturas se cargan al entrar en la zona visible y comparten un único renderizador 3D.
- Los modelos y sus geometrías base se cargan de los archivos incluidos en `assets`. También se pueden abrir archivos SVG locales.
- El redimensionado y los ajustes de solapas usan deformación geométrica local por bandas. La banda modifica todas las líneas y caras que atraviesa, por lo que puede cambiar piezas vecinas. Las fórmulas originales de cada diseño no están incluidas; el resultado no equivale necesariamente a un cálculo estructural exacto.
- La interfaz usa únicamente milímetros y las exportaciones no incluyen sangrado.
- Las piezas simétricas comparten un único campo en Detalles; se comprueban su contorno y sus huecos. Las piezas distintas conservan sus medidas independientes.
- Material ofrece tres acabados: blanco/blanco, blanco/marrón y marrón/marrón. El espesor manual no se muestra. El catálogo incluido es C1 (1,5 mm), confirmado por el usuario. Los modelos propios pueden clasificarse como C1 (1,5 mm), C3 (3 mm), C5 (4,5 mm) o C8 (7 mm). Estos códigos determinan el espesor representado en 3D; no recalculan los retranqueos ni las tolerancias del plano.
- Después de abrir SVG o DXF, «Añadir a biblioteca» permite indicar nombre y cartón. «Mis modelos» conserva la geometría actual, incluidos cortes, hendidos, huecos y panel base. Se guarda localmente en la carpeta de datos de la aplicación (`library`), sin depender del archivo original ni guardar la imagen de arte. En el navegador se utiliza su almacenamiento local. Los modelos propios admiten búsqueda y preferidos.
- El corazón de cada tarjeta añade o quita el modelo de «Preferidos». La selección se conserva localmente al cerrar la aplicación y se puede combinar con el buscador.
- Asa, uñero y pestaña de cierre tienen una ventana de medidas con deslizadores en tiempo real. El asa permite ancho, largo y radio; el uñero, uno o dos recortes, radio y distancia entre centros. Los huecos y las muescas modifican la malla 3D. La pestaña añade una cara articulada y sustituye el corte de unión por un hendido.
- Las dimensiones interiores y exteriores se estiman usando los ajustes del material y su espesor. Son aproximaciones.
- Las variaciones de piezas son experimentales. Verifica los planos y las medidas antes de fabricar.
- Se pueden exportar SVG, DXF, PDF, GLB y PNG. El formato AI nativo no está implementado; PDF y SVG se pueden abrir en Illustrator.

El antiguo extractor de catálogo remoto está desactivado.
