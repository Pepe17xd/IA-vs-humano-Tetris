# Auditoría de integración v0.4

## Arquitectura e incompatibilidades

El motor representa el tablero mediante 20 enteros de 10 bits y `search` recibe ese tablero y una cola de piezas conocidas. El clasificador espacial produce ocupación y confianza; el seguimiento temporal entrega EMPTY, LOCKED, ACTIVE, GHOST o UNKNOWN, cambios y validez. El adaptador verifica forma, categorías y confianza; rechaza UNKNOWN y construye las filas solo con LOCKED. La geometría identifica una pieza completa entre las rotaciones del motor. La cola siguiente no se detecta, por lo que se usa búsqueda de profundidad uno y se enumeran las caídas disponibles del motor.

Se reutilizan captura, calibración, reconstrucción, seguimiento, visualización y búsqueda. La permanencia por sí sola no demuestra bloqueo; el seguimiento puede dejar en UNKNOWN los bloques presentes antes de comenzar y sus estados ACTIVE/LOCKED son hipótesis. El adaptador no puede verificar que una hipótesis visual definida sea verdadera. El clasificador de fantasmas requiere evidencia externa y no se proporciona en captura en vivo. Además el motor no modela alcanzabilidad desde la posición actual, SRS, hold o reglas completas. Una recomendación válida en su modelo no garantiza una jugada realizable en TETR.IO.

## Validación

No se encontraron capturas reales exportadas dentro del proyecto. No hay medición de exactitud real, confianza calibrada ni validación interactiva con Chrome. Las pruebas sintéticas cubren adaptación, geometría, rechazo, colocaciones del motor, el flujo desde imágenes sintéticas, exportación, evaluación y captura inválida. Se proporciona un procedimiento de etiquetado manual y un comando de evaluación; las métricas solo describirán los datos etiquetados. El usuario debe comprobar manualmente la cuadrícula y reunir secuencias representativas antes de interpretar resultados.

No se modifica el juego, no se accede a sus mecanismos internos y no se automatizan entradas.
