# Recetas y costeo: detalle

## Archivo vigente

`COSTOS_RECETAS_2022_REVISION_PRELIMINAR_V7_CAMBIOS_CLAUDE.xlsx` (Matías lo sube al chat; no está en Drive con ese nombre). 626 hojas:

- `ÍNDICE`, `RESUMEN COSTOS` (por receta: CD total, CD por porción, CMG %, precio de venta, precio + IVA, **costo porción + adelanto** con 25% en I3), `AUDITORÍA`, `INGREDIENTES FALTANTES`, `PENDIENTES`.
- `LISTA ` (con espacio al final): insumos. A descripción, B unidad, C precio, E rinde (merma). 307 precios vienen de un archivo externo de proveedores (`[1]GERMAR!...`): en Google Sheets esos vínculos no funcionan.
- `AUMENTOS`: historial de precios.
- Una ficha por hoja (619). Formato estándar: G2 porciones; ingredientes en A8:A27, cantidad C, rinde D, unidad E, precio unitario F (VLOOKUP a LISTA), total G; C28/C29 CD total; C30 CD por porción; C31 CMG 0,75; C32 precio de venta = C30/(1-0,75); C33 + IVA. Algunas fichas tienen las filas corridas una posición.

## Sub-recetas

Una receta usada como ingrediente aparece en LISTA con una fórmula que apunta a su hoja (`=BOLOGNESA!C29`). Diagnóstico del 28/10/2026:

- 84 fichas usan sub-recetas: 72 de 2 niveles, 8 de 3, 1 de 4 (MENU EJECUTIVO).
- La celda apuntada no es uniforme: 75 al costo por porción (bien), 7 al costo total de la tanda, **79 a un precio de venta** (costo × 2 a × 13).
- Usos con precio de venta que inflan costos: GRANOLA (en Yogurt + granola y Peras + almíbar), PROMEDIO PURE (en Promedio fritas-ens ejec → Menú ejecutivo), promedios de ensaladas chicas (en Medallón vegano, Promedio omelettes, Menú ejecutivo), BLINIS y TARTA AZUCARADA (en Evento Mitzy). Los "PROMEDIO … VENTA" que promedian precios de carta son intencionales.
- **TALLA PROMO se usa a sí misma** (ciclo): rompe Talla Promo, Promedio Promos y Promo Marineritos.
- 95 celdas de la columna G apuntan por error a `'CHOCO ORANGE PIE'!A1` en vez de F×C; 10 tienen cantidad cargada y dan mal hoy (Creps de salmón, Pan dulce, Selva negra, Sorrentinos de zapallo, Marquise, Pan casero hamburguesa, Torta brownie nutella, Budín de limón relleno, Tarta arroz con leche, Choco orange pie).
- "TIEMPO" es la mano de obra de la ficha y **se mantiene**: forma parte del costo que se usa para adelantos (decisión de Mat; ver SKILL.md).

## Planilla única propuesta (Google Sheets)

1. Proveedores: precio de compra y formato.
2. Insumos: costo por unidad de uso y merma, calculado desde Proveedores.
3. Recetas: una fila por ingrediente (receta, ingrediente, cantidad, unidad); ingrediente elegido de una lista (insumo u otra receta); rendimiento por receta.
4. Costos: costo total (con mano de obra), por porción y para adelantos (+25%). Las sub-recetas entran siempre por costo por porción.
5. Revisar: ciclos, ingredientes inexistentes, cantidades sin precio, con el motivo, para que Mat lo revise.

Migración: pasar las fichas limpias automáticamente y mandar a "Revisar" solo las dudosas. Pendiente de definir con Matías: si se migran las fichas viejas (eventos 2019, Año Nuevo, etc.) y si el 25% aplica a todo.

## Estructura y margen (agosto 2026) — solo como antecedente

Ojo: este análisis separó la mano de obra del costo del plato y eso le trajo problemas a Mat. No usar estas cifras para cambiar precios ni criterios de costeo.


Ventas $65,9 M; compras $23,3 M; estructura $19,03 M (28,9% de la venta: retiros $17,19 M, servicios EPE/Litoral Gas/Clean City, taxi, mantenimiento, cursos); resultado $23,5 M. No hay canon ni cargas sociales (cooperativa, monotributistas). Los retiros son remuneración del trabajo, no reparto de excedentes. Antecedente: claude.ai/artifact/19jn2r5Cq5PtnR5PSxrSrE.
