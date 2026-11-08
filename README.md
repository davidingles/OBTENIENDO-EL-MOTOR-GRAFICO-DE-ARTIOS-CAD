# Mi ArtiosCAD Personalizado · Motor Gráfico 3D & 2D de Packaging + 116 Modelos FEFCO Paramétricos

Estudio CAD de Packaging 2D y 3D en **escala 1:1 en milímetros (`mm`)**, construido combinando la base de datos de cartones y texturas reales extraídas de **Esko ArtiosCAD 12.0** con el **catálogo completo de 116 plantillas estructurales FEFCO parametrizables en tiempo real**.

---

## ✨ Características Principales

1. **Catálogo Completo de 116 Modelos FEFCO Integrado ([`assets/fefco-catalog.js`](assets/fefco-catalog.js)):**
   - Incluye las **116 normas FEFCO** extraídas con su geometría paramétrica a escala 1:1 en `mm` (`faces`, comandos vectoriales `M/L/A/Q/Z`, `holes`, `cuts`, `folds`, `sizeArrowData`) y su secuencia cinemática de plegado 3D multicapa (`animations`):
     - **Serie 02xx:** Cajas Americanas Ranuradas (FEFCO 0201, 0200, 0202, 0203, 0204, 0210, 0211, 0215, 0216, 0217...).
     - **Serie 03xx:** Cajas Telescópicas de Tapa y Fondo (FEFCO 0300, 0301, 0306, 0312, 0320, 0330...).
     - **Serie 04xx:** Estuches Automontables, Bandejas y Cajas de Envíos E-Commerce (incluyendo **FEFCO 0427 / `#150011`**, FEFCO 0422, 0420, 0421, 0426, 0452...).
     - **Series 05xx – 09xx:** Fondos Automáticos (FEFCO 0701, 0711, 0713), Expositores PLV (FEFCO 0801, 0840) y Separadores/Rejillas.
2. **Parametrización en Tiempo Real (`Largo L × Ancho W × Alto H`) en la Vista 2D:**
   - Modifica **Largo (`L`)**, **Ancho (`W`)** y **Alto (`H`)** en milímetros directamente en la barra flotante de la vista **Plano Troquel 2D** (arrastrando el deslizador, escribiendo con el teclado numérico o girando la ruleta del ratón).
   - **Doble Motor Paramétrico:**
     - **Deformación Paramétrica por Bandas a 60 FPS (`DielineEngine.resizeDielineParametric`):** Funciona instantáneamente y 100% offline tanto para los 116 modelos FEFCO como para cualquier archivo `.svg` cargado (`b1 caja americana.svg`, estuches, bandejas), preservando sin deformar el ancho de las pestañas de pegado, radios de ranura y cierres.
     - **Solver Paramétrico FEFCO Exacto (`/api/pacdora/knife` en [`server.js`](server.js)):** Recalcula al milímetro todas las curvas, muescas y compensaciones de espesor (`thickness`).
   - Botón **💾 `.SVG 1:1`** para descargar el plano troquel 2D ya redimensionado con tus nuevas medidas en formato `.SVG` listo para corte/plotter.
3. **Hendido Chafado / Hundido por Ambas Caras (Interior y Exterior):**
   - Subdivisión geométrica de la malla 3D a lo largo de todas las líneas rojas de doblez (`#e5007d`) para recrear el canal físico que deja el troquel al golpear y chafar el cartón por dentro y por fuera.
   - Orientación de normales (`Face Orientation` CCW exterior) verificada al 100% en Cara Exterior, Cara Interior y Canto Corrugado.
4. **Ejes de Rotación en el Centro Exacto del Espesor (`z = 0`):**
   - Todos los pivotes cinemáticos rotan estrictamente sobre el plano central del espesor del cartón (`z = 0.00 mm`).
5. **Exportación Nativa a Blender (`.GLB` Animado a Escala 1:1 en `mm`):**
   - Exporta el modelo 3D con sus texturas de cartón de ArtiosCAD 12.0, jerarquía de pivotes en el centro del espesor y 2 clips de animación (`01_Plegado_Caja_Por_Fases` y `02_Ciclo_Plegado_Y_Desplegado`).
6. **Controles Triples en Todos los Sliders:**
   - Todos los controles admiten arrastrar la bolita, escribir el valor exacto con el teclado numérico y ajustar con la ruleta del ratón (`wheel`, o `Shift + Ruleta` para pasos rápidos ×5).

---

## 🚀 Cómo Iniciar

Haz doble clic en [`iniciar_motor_3d.bat`](iniciar_motor_3d.bat) o ejecuta:

```bash
node server.js
```

Y abre **`http://localhost:8080`** en tu navegador.
