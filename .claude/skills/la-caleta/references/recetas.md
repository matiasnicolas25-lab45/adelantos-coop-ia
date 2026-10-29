# Recetas y costeo: detalle

## Archivo vigente (desde el 28/10/2026)

`COSTOS RECETAS LA CALETA.xlsx`: es la V7 con **el mismo formato** (una ficha por hoja, LISTA, RESUMEN COSTOS) más las 44 hojas de COSTOS PRODUCTOS (precios por proveedor) adentro, después de LISTA. Cadena: hoja del proveedor → LISTA → ficha → RESUMEN COSTOS. Ya no hay vínculos a archivos externos. Mat quiere que el formato siga igual que siempre: no cambiar la estructura de las fichas ni pasarlas a otro formato. Hoja "CAMBIOS 28-10" con lo que se arregló. Va en Drive, carpeta "3 Recetas y costos" (Mat lo sube y lo abre con Google Sheets).

Precios cruzados el 28/10 con "Precios La Caleta" (pestaña Proveedores, al 22/10) y facturas de octubre: 78 precios cambiados (celdas amarillas con nota del precio anterior), lista completa y lo que quedó "a revisar" en la hoja "PRECIOS 28-10". Regla usada: se cambia solo la celda que se tipea (FINAL/actualización), y solo si la variación está entre −40% y +70%; si no, va a revisar (suele ser otra unidad: cajón vs kg). La lista que hay que mantener al día para recetas es la de proveedores: cuando se cargue una factura nueva en "Precios La Caleta", cargarla también en la hoja del proveedor de este archivo.

### Precios de carta → Resto Soft

Hoja "RESTO SOFT" (después de AUMENTOS): una fila por plato activo de Resto Soft (y por tamaño), con su código, el precio que tiene hoy en Resto Soft y la fila de AUMENTOS a la que está vinculado (en pastas, también la fila de la salsa). "Precio nuevo" = precio de Resto Soft × (AUMENTOS hoy ÷ AUMENTOS al vincular), redondeado a $100; usa INDIRECT a la columna C de AUMENTOS para que no se corra cuando se inserta una columna de aumento nueva. "Precio a mano" pisa todo. Columna "Cambia" = SÍ si el precio nuevo es distinto.

Para armar el .txt que se importa en Resto Soft: bajar la planilla de Drive como .xlsx (ya calculada), pedirle a Mat una exportación nueva de la carta de Resto Soft (CARTA.txt) y correr `python3 scripts/restosoft_txt.py planilla.xlsx CARTA.txt salida.txt`. Sale una copia de CARTA.txt idéntica salvo los precios que cambian (tablas PLATOS y PLATOS_TAMANIOS). Antes de importar, Mat guarda una exportación de respaldo. Después de armar el .txt, en la hoja RESTO SOFT poner el precio nuevo en "Precio en Resto Soft" (F) y el valor de "AUMENTOS hoy" en "Base" (I) de esas filas, así la hoja queda igual al sistema y no vuelven a salir como cambio.

Criterios de Mat (28/10): cuando AUMENTOS y Resto Soft no coinciden, **va el precio más alto** (si el más alto es el de Resto Soft, se corrige AUMENTOS). Frutas y verduras: en las hojas de proveedores el FINAL es el precio del cajón/bolsa y la columna C es el precio por kg; **las recetas tienen que usar siempre el precio por kg** (la LISTA en KG apunta a la columna C). Se corrigieron FRUTILLAS, CAMOTE y BONIATO, que tomaban el cajón.

Al 28/10: 499 filas (309 vinculadas, 190 sin vincular: kiosco, vinos y varios; se vinculan escribiendo la fila de AUMENTOS en la columna G). 14 platos tenían distinto precio: se resolvieron con "va el más alto" (8 suben en Resto Soft con PRECIOS RESTO SOFT 28-10.txt; en 5 se corrigió AUMENTOS; ESTOFADO de pastas se desvinculó porque es la salsa).

Pendiente: sub-recetas que entran por precio de venta y el ciclo de TALLA PROMO (ver abajo) siguen sin tocar; plantearlo solo a Mat. "DD LECHE EUREKA FAMILIAR" falta en LISTA (Torta brownie nutella).

## Archivo anterior

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

## Planilla única propuesta (Google Sheets) — DESCARTADA

Mat pidió el 28/10 mantener el formato de siempre (ver "Archivo vigente"). Esto queda solo como antecedente.


1. Proveedores: precio de compra y formato.
2. Insumos: costo por unidad de uso y merma, calculado desde Proveedores.
3. Recetas: una fila por ingrediente (receta, ingrediente, cantidad, unidad); ingrediente elegido de una lista (insumo u otra receta); rendimiento por receta.
4. Costos: costo total (con mano de obra), por porción y para adelantos (+25%). Las sub-recetas entran siempre por costo por porción.
5. Revisar: ciclos, ingredientes inexistentes, cantidades sin precio, con el motivo, para que Mat lo revise.

Migración: pasar las fichas limpias automáticamente y mandar a "Revisar" solo las dudosas. Decidido (29/10): no se migran las fichas; se sigue con el formato de siempre. **El 25% de adelanto va para todos los platos.**

## Estructura y margen (agosto 2026) — solo como antecedente

Ojo: este análisis separó la mano de obra del costo del plato y eso le trajo problemas a Mat. No usar estas cifras para cambiar precios ni criterios de costeo.


Ventas $65,9 M; compras $23,3 M; estructura $19,03 M (28,9% de la venta: retiros $17,19 M, servicios EPE/Litoral Gas/Clean City, taxi, mantenimiento, cursos); resultado $23,5 M. No hay canon ni cargas sociales (cooperativa, monotributistas). Los retiros son remuneración del trabajo, no reparto de excedentes.
