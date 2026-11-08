# 📦 Packaging CAD 3D Studio (Motor ArtiosCAD 12.0 · Escala 1:1 mm)

Motor gráfico 3D y 2D de packaging de cartón que abre archivos vectoriales `.svg` a **escala real 1:1 en milímetros (`mm`)**, extruye las caras al espesor físico del cartón con texturas reales de **Esko ArtiosCAD 12.0**, genera el **hendido chafado/hundido por ambas caras** en las líneas de doblez, rota sobre el **centro exacto del espesor (`z = 0`)** y exporta el modelo 3D animado en `.GLB` listo para **Blender**.

## ✨ Características Principales

- **Convención Universal de Líneas en `.SVG`**:
  - 🔵 **Líneas Azules (`#009ee3`)**: Líneas de **Corte** (con textura de onda/flauta corrugada en el canto).
  - 🔴 **Líneas Rojas/Magenta (`#e5007d`)**: Líneas de **Doblez / Hendido Chafado**.
  - 📏 **Escala 1:1 en `mm`**: Calibración automática mediante detección de la cota del archivo (ej. `542.74 mm`).
- **Hendido Chafado por Ambas Caras**:
  - Subdivisión geométrica de la malla a lo largo de cada línea roja para hundir progresivamente tanto la cara interior como la exterior hacia el eje central (`z = 0`).
- **Cinemática de Plegado con Eje en el Centro del Espesor (`z = 0`)**:
  - Secuencia de armado por fases (Cuerpo → Solapas Interiores Fondo → Solapas Exteriores Fondo → Tapa) y control individual por cada bisagra (`-180°` a `+180°`).
  - Todos los controles admiten **arrastrar el slider**, **escribir con el teclado numérico** o **girar la ruleta del ratón** sobre el valor.
- **Exportación a Blender (`.GLB` Animado a Escala 1:1 en `mm`)**:
  - Exporta la geometría subdividida, las texturas de ArtiosCAD incrustadas, los pivotes en el centro del espesor y 2 pistas de animación (`01_Plegado_Caja_Por_Fases` y `02_Ciclo_Plegado_Y_Desplegado`).

## 🚀 Uso Rápido

Haz doble clic en `index.html` o ejecuta `iniciar_motor_3d.bat`.
