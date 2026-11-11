# Parametrización por relaciones de plegado

El motor sigue las tres direcciones físicas a través del grafo de hendidos ortogonales. Las cotas L/W/H anclan esas direcciones, aunque estén sobre paneles diferentes. Una medida vertical de tapa puede así controlar una pared horizontal en el desarrollo.

La inferencia no depende del número de modelo ni de sus nombres. Tolera ángulos de plegado de 89–91 grados y conserva las diferencias dimensionales pequeñas de fabricación. Solo propaga a bandas próximas a una dimensión completa: las lengüetas y las solapas parciales no se convierten en paredes completas. Las cotas explícitas tienen prioridad y los cambios locales siguen siendo locales.

Pruebas de referencia: estuches 10001004 y 10001018, fondo automático 10501002, caja con tapa 150010. En folding-box-dielines-p1 se reconocen relaciones en 99 de 120 modelos; se ensayan dos cambios de proporción en esos modelos comprobando coordenadas finitas, número de caras y bisagras, tamaños positivos y cotas principales. Esto no certifica encajes, colisiones ni fabricación.

Límites: necesita tres direcciones identificables y cotas coherentes, no resuelve pliegues oblicuos, curvas espaciales ni mecanismos de cierre arbitrarios. Cuando la inferencia es ambigua se mantiene el comportamiento previo. La deformación continúa usando bandas globales; no sustituye un solucionador de restricciones completo ni reconstruye fórmulas originales del fabricante. Modelos ya deformados y guardados pueden necesitar abrirse de nuevo desde el catálogo para recuperar la geometría de referencia.

## Relaciones estructurales adicionales

Las solapas superiores de cierre parcial se reconocen como hojas del grafo unidas a una tira de cuatro paredes. Su profundidad se limita a la mitad de la cara receptora perpendicular, sin consultar códigos FRT/FLT ni números de catálogo. Actualmente este reconocimiento trabaja con tiras horizontales y solapas superiores en el desarrollo.

El redimensionado conserva la pendiente original de los hendidos oblicuos. Para los fondos con dos caras unidas por una diagonal y una unión horizontal al cuerpo, una transformación compartida restaura esa pendiente manteniendo fija la unión al cuerpo. Por tanto, un hendido original de 45 grados conserva 45 grados; no se convierten otras inclinaciones en 45 grados. Primero se limitan solapas y después se resuelven ángulos. Caras, cortes, hendidos, articulaciones y cotas reciben la misma transformación. Los fondos con otra topología todavía pueden necesitar un método adicional.

Las pruebas incluyen el fondo automático 10501002 sin nombres de caras ni de hendidos, cuatro redimensionados consecutivos, coincidencia de vértices compartidos y de los hendidos exportados. Una geometría ya deformada que perdió su pendiente original debe recuperarse del catálogo para inferirla correctamente.


## Recuperación de fondos y esquina de pegado

Los hendidos diagonales de encolado casi planos (ángulo espacial inferior a 10 grados) se reconocen como enlaces del fondo automático y recuperan su pendiente plana de ±1, incluso si una geometría guardada no contiene planarSlope. No se toma una diagonal ya deformada como nueva referencia de 45 grados. Esta recuperación se aplica a la disposición inferior con unión horizontal al cuerpo descrita arriba.

Al importar el catálogo se rectifica la esquina terminal curva de una pestaña estrecha con una sola unión vertical al cuerpo. Se modifica tanto el perímetro de la cara como la trayectoria de corte; los radios de tapas y asas se mantienen. Esta rectificación del contorno de origen requiere volver a abrir el original del catálogo si el modelo guardado conserva el arco antiguo.
