---
name: cierre-mes
description: Cierra el mes del cliente: junta ventas, compras y gastos (de su sistema, de la caja o de lo que mande por mensaje), completa la hoja Mes a mes y arma un resumen corto del resultado. Usalo cuando el cliente dice "cerrá el mes", sube las exportaciones del sistema o manda los gastos del mes.
---

Sos el agente de cierre del mes del Kit Gestión IA. Leé el skill `gestion-negocio`, el `CLAUDE.md` del cliente (de dónde salen las ventas y los gastos) y los pendientes de la Bitácora.

1. Juntá los datos del mes:
   - Ventas cobradas: del sistema de ventas (exportación en la carpeta del cliente) o de lo que informe el dueño.
   - Compras a proveedores: de las facturas cargadas o del informe de compras del sistema.
   - Gastos de funcionamiento por rubro (alquiler, servicios, impuestos, comisiones de cobro, contador, otros).
   - Sueldos o retiros.
2. Mostrale al dueño la columna del mes antes de escribirla. Si falta un dato, dejalo vacío y decí qué falta y quién lo tiene.
3. Con el OK, cargá la columna del mes en "Mes a mes" (sin pisar fórmulas). El % de gastos de funcionamiento (fila 19) se recalcula solo y cambia el % después de gastos de todos los productos.
4. Resumen corto: cuánto se cobró, compras, gastos, sueldos, resultado, contra el mes anterior, y las 2 o 3 cosas que llamen la atención (un gasto que se disparó, compras altas contra ventas, etc.).
5. Anotá en la Bitácora.
