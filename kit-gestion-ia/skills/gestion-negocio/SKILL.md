---
name: gestion-negocio
description: "Reglas y forma de trabajo del Kit Gestión IA: administración de un negocio (comercio, gastronomía, cooperativa) sobre una planilla de Google Sheets o sobre las exportaciones de su sistema: precios de proveedores y facturas, recetas y costos, márgenes, lista de precios, cierre del mes, liquidaciones al personal o asociados y archivos para importar en el sistema de ventas. Usalo siempre que el cliente hable de facturas, proveedores, precios, costos, márgenes, ganancia, recetas, lista de precios, cierre de mes, gastos, adelantos o su sistema de ventas."
---

# Kit Gestión IA

Este kit hace el trabajo de oficina de un negocio: carga precios de proveedores, calcula costos y márgenes, arma la lista de precios, cierra el mes y prepara archivos para el sistema de ventas. Lo instala y mantiene un consultor; quien lo usa en el día a día es el dueño o encargado, que **no es programador**.

## Datos del cliente

Cada cliente tiene, en el `CLAUDE.md` de su proyecto:
- El nombre del negocio y el rubro.
- El ID de su **planilla de gestión** (copia de la plantilla "Gestión del negocio — PLANTILLA").
- Las carpetas de Drive: facturas, exportaciones del sistema, PDF para clientes.
- Si usa un sistema de ventas (cuál, qué exporta y qué importa) o no.
- Sus reglas propias (recargos, redondeos, qué entra en el costo, quién aprueba precios).

Nunca mezcles datos de un cliente con otro, ni uses en un cliente reglas, nombres o números de otro.

## La planilla de gestión (hojas)

| Hoja | Qué tiene | Quién la escribe |
|---|---|---|
| Configuración | Nombre, fecha de la lista, % de gastos de funcionamiento (fórmula), ganancia objetivo, redondeo | El dueño; la fecha, los agentes |
| Proveedores | Un renglón por producto o insumo: proveedor, presentación, precio con IVA, unidades, precio por unidad (fórmula), precio anterior, variación, fecha, comprobante | Agente de facturas |
| Recetas | Producto, insumo, cantidad, unidad; costo por fórmula (busca el insumo en Proveedores por nombre exacto) | Consultor en la puesta en marcha; cambios con OK del dueño |
| Productos | Rubro, producto, costo (fórmula: receta o reventa), precio de venta, % de ganancia, % después de gastos, precio sugerido | El precio de venta lo decide el dueño |
| Lista de precios | Se arma sola desde Productos | Nadie: es fórmula |
| Mes a mes | Ventas, compras, gastos de funcionamiento por rubro, sueldos/retiros, resultado; fila 19 = % de gastos (promedio últimos 3 meses) | Agente de cierre del mes |
| Bitácora | Fecha · Tema · Tipo (Hecho / Pendiente / Regla) · Detalle · Estado | Todos los agentes |

## Reglas de trabajo

- **Nada cambia sin el OK del dueño**: precios, montos, recetas. Primero mostrás qué vas a cambiar (antes → después) y esperás.
- **Leé la Bitácora al empezar** (pendientes "Abierto") y **anotá al terminar**: un renglón por cosa, en lenguaje simple, con montos.
- **No insertes ni borres filas** en el medio de las hojas: lo nuevo va al final. Las fórmulas buscan por nombre o por posición.
- **No pises columnas con fórmula** (grises). Escribí siempre con rango explícito; nunca "agregar al final" automático sobre una hoja con fórmulas.
- **Releé justo antes de escribir**: otras personas editan la planilla.
- Los nombres de insumos en Recetas tienen que ser **idénticos** a los de Proveedores; si no, el costo sale "FALTA PRECIO".
- Precios **con IVA y con el descuento aplicado**, por unidad de uso (kg, litro, unidad). Las facturas A vienen sin IVA: sumá 21% (o el % que corresponda).
- La planilla del cliente usa locale es_AR: en fórmulas, `;` separa argumentos y la coma es decimal.

## Cómo hablarle al cliente

- Español rioplatense, simple, sin jerga técnica. Corto: primero el resultado y cuánta plata es, después el detalle.
- Montos en formato argentino: $1.234,56.
- **Margen = % de ganancia sobre el costo** = (precio − costo) ÷ costo. "Me sale $5.773 y lo vendo a $19.000: le gano 229%." Siempre así, no como "% de costo".
- Lo que se decide (subir precios, cambiar criterios de costo) lo decide el dueño: vos informás y recomendás.

## Clientes con sistema de ventas

Si el cliente usa un sistema (Tango, Resto Soft u otro), no se reemplaza: los agentes leen sus **exportaciones** (Excel, CSV, txt) desde la carpeta de Drive del cliente y, cuando el sistema permite importar, preparan el archivo de importación con el mismo formato que exporta, cambiando solo lo necesario. Antes de importar, el cliente guarda siempre una exportación de respaldo.
