# Auditoría v0.3

## Inspección visual

Se revisaron la calibración, el clasificador HSV, la exportación y sus pruebas. No se encontraron capturas reales exportadas en los archivos del proyecto; por ello no se pudo comprobar la alineación de 200 celdas ni calcular tasas de error o calibración de confianza en TETR.IO. Las pruebas sintéticas no miden precisión real. En v0.2 la cuadrícula visual distribuía sus líneas con extremos distintos a los de extracción cuando las dimensiones no eran divisibles; ahora ambas usan los mismos límites, recortando el último borde a la imagen.

## Seguimiento

El seguimiento compara observaciones consecutivas, agrupa celdas conectadas y reconoce traslaciones simples de grupos de cuatro. La persistencia se registra sin considerarla por sí sola prueba de bloqueo. LOCKED es una hipótesis cuando un grupo anteriormente seguido permanece y aparece otro grupo que se mueve. Cambios extensos o ambigüedad invalidan la observación y reinician el seguimiento. La desaparición de bloques hipotéticamente fijos invalida la observación y descarta la evidencia; no se simula una eliminación de línea. Se ofrecen estados explícitos, confianza, cambios y persistencia, y el adaptador al planificador rechaza estados inciertos o piezas visibles.

GHOST solo se asigna con una máscara de evidencia suministrada externamente; el análisis de pantalla no la produce. No se ha validado esta entrada con datos reales. ACTIVE y LOCKED no son garantías: piezas tocándose, movimientos rápidos, rotaciones, bloqueos y animaciones pueden romper las hipótesis. Hay que recopilar y etiquetar secuencias reales, medir precisión y calibrar confianza antes de usar el resultado para decisiones. El sistema no envía entradas ni inspecciona mecanismos internos.

## Pruebas

Se añadieron pruebas sintéticas de movimiento horizontal y vertical, persistencia, bloqueo tentativo, desaparición de bloques, evidencia de fantasma, ambigüedad, recuperación y exportación. La desaparición ensayada representa la invalidación ante una posible eliminación de línea, no una reconstrucción de su desplazamiento. Ver resultado de Pytest en la entrega; las pruebas no sustituyen la validación real.
