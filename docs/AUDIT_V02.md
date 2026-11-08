# Auditoría v0.2

## Base auditada

Se revisaron los archivos fuente, configuración, documentación y pruebas del proyecto; el entorno virtual y los metadatos generados no son código propio. La arquitectura separa simulador y búsqueda (`core`), orquestación opcional (`graph`), laboratorio sintético (`human_lab`), estadísticas públicas (`channel`) y captura de pantalla (`vision`). Las cinco pruebas originales pasaron antes del cambio. Las dependencias existentes cubren la implementación; no se agregaron paquetes.

La visión anterior solo dibujaba una cuadrícula sobre una región JSON manual y rechazaba coordenadas cero o negativas. No reconstruía celdas ni medía rendimiento. El simulador es deliberadamente simplificado; no reproduce SRS, hold, garbage ni todas las reglas. La prueba original de bolsa solo solicita una pieza y no demuestra la propiedad de una bolsa de siete. No se identificaron duplicaciones significativas que justificaran reestructurar los componentes existentes.

## Cambios y verificación

Se agregó selección manual y persistencia de región, división uniforme en 200 celdas, clasificación HSV conservadora, confianza, exportación y métricas. La conversión para el motor rechaza observaciones con celdas inciertas. Las pruebas sintéticas verifican tamaños, colores, incertidumbre, calibración, errores de entrada y exportación. La comprobación automatizada no necesita Chrome ni conexión de red. Para evitar una restricción de permisos del directorio temporal y caché de este entorno, la ejecución usó TEMP/TMP dentro del proyecto y `-p no:cacheprovider`.

## Pendiente y riesgos

No se realizó una prueba interactiva con Chrome ni se dispone de imágenes reales etiquetadas. Los umbrales no están calibrados para temas, resolución, efectos, animaciones ni pieza fantasma. La categoría ocupada puede incluir la pieza activa y no es una representación validada de piezas fijas para el planificador. Los efectos visuales pueden generar tanto incertidumbre como clasificaciones erróneas; la confianza es una proporción de píxeles, no una probabilidad estadística. No existe detección automática de desalineación ni separación temporal de estados. El usuario debe verificar la cuadrícula y recalibrar después de cambios de pantalla. No se envían entradas al juego ni se accede a sus mecanismos internos.
