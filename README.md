# Mi ArtiosCAD Personalizado · Motor Gráfico 3D & 2D de Packaging + 2,148 Modelos Pacdora & FEFCO Paramétricos

Estudio CAD de Packaging 2D y 3D en **escala 1:1 en milímetros (`mm`)**, construido combinando la base de datos de cartones y texturas reales extraídas de **Esko ArtiosCAD 12.0** con el **catálogo completo de 2,148 plantillas estructurales de `https://www.pacdora.com/dielines` (incluyendo las 116 normas FEFCO) parametrizables en tiempo real**.

---

## ✨ Características Principales

1. **Catálogo Completo de 2,148 Modelos Distribuido por Categorías Web ([`assets/pacdora-catalog/`](assets/pacdora-catalog/)):**
   - Incluye los **2,148 troqueles estructurales de Pacdora Dielines** extraídos con su geometría paramétrica a escala 1:1 en `mm` (`faces`, comandos vectoriales `M/L/A/Q/Z`, `holes`, `cuts`, `folds`, `sizeArrowData`) y su secuencia cinemática de plegado 3D multicapa (`animations`).
   - **Distribución Modular Ligera idéntica a `pacdora.com/dielines`:**
     - **[`assets/pacdora-catalog/catalog-index.js`](assets/pacdora-catalog/catalog-index.js):** Índice maestro ligero con buscador instantáneo y el árbol oficial de **21 categorías *By Models*** (`FEFCO Boxes`, `Folding Boxes`, `Tray Boxes`, `Display Boxes`, `Tuck End Boxes`, `Box Inserts`, `Paper Bags`, `Rigid Boxes`, `Window Boxes`, `Boxes with Lid`, `Storage Boxes`, `Tuck End Variations`, `Envelopes`, `Sleeves`, `Folders`, `Cards & Tags`, `Polygonal Boxes`, `Sphere Boxes`, `Triangle Boxes`, `Pouches`, `Others`) y **16 categorías *By Uses*** (`Gift Boxes`, `DIY Boxes`, `Shipping Boxes`, `Mailer Boxes`, `Food`, `Toys`, `Coffee`, `Tobacco`, `Personal Care`, `Beverage`, `Office`, `Barbie Box`, `Candies`, `Medicine`, `Alcohol`, `Milk & Yogurt`).
     - **30 Módulos de Geometría Bajo Demanda (`≤ 2 MB` por archivo):** Cada categoría carga únicamente el módulo `.js` que necesita en el momento de visualizarse o abrirse.
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
