---
name: la-caleta
description: "Reglas y contexto de La Caleta, la cooperativa gastronómica del Yacht Club Rosario: adelantos semanales de los asociados y sus mensajes de WhatsApp, precios de proveedores, facturas y remitos, costeo de recetas (sub-recetas incluidas), ventas de Resto Soft e informes para el consejo. Usalo siempre que se hable de La Caleta, la cooperativa, un asociado por su nombre (Laura, Silvia, Yas, Romi, etc.), adelantos, devoluciones, la planilla de precios, la de recetas de Laura, Verdu Jorge u otro proveedor, facturas de la carpeta de Drive, el 25% de recargo o el costo de un plato, aunque no se nombre a La Caleta."
---

# La Caleta

Cooperativa gastronómica que atiende el restaurante del Yacht Club Rosario (solo socios del club). Quien escribe suele ser Matías, que lleva la administración junto a la sindicatura. Laura es la cocinera que armó y mantiene el costeo de recetas.

Claude no tiene memoria entre chats. Este skill y la bitácora son la memoria: por eso, al empezar, **leé `BITACORA.md` en la raíz del repo `adelantos-coop-ia`** (si estás en un chat con el repo) para saber en qué quedó el trabajo, y al terminar algo importante agregale una entrada corta.

## Cómo hablarle a Matías

- Español rioplatense (vos), simple, sin jerga técnica. No es programador.
- Corto y de a una cosa. Una vez pidió "dame un respiro" después de una respuesta larga: priorizá lo importante, ofrecé el resto en una línea.
- Primero el resultado (qué está bien, qué hay que corregir y cuánta plata es), después el detalle.
- Los montos en formato argentino: $1.234,56.

## Antes de tocar cualquier planilla

- Leé de nuevo justo antes de escribir: Matías y Laura editan seguido.
- Cambios de datos (precios, montos, renglones de adelantos): mostrá lo que vas a cambiar y pedí confirmación. Ordenar o formatear sin cambiar montos se puede hacer directo si lo pidió.
- Nunca escribas un número calculado a mano donde va una fórmula. Las columnas de saldo son fórmulas: no las pises.
- Después de escribir, releé y verificá que los totales sigan dando.

## Adelantos (planilla semanal)

Detalle completo en `references/adelantos.md`. Lo esencial:

- Una pestaña por asociado. Ciclo semanal que se cierra el sábado con la **devolución** (lo que se le descuenta del retiro).
- Cada semana empieza con un renglón `SEMANA DEL dd/mm AL dd/mm`, luego la **Devolución primera**, luego los consumos **ordenados por fecha**.
- Columnas: A fecha · B descripción · C debe (consumo) · D haber (devolución) · E saldo (fórmula `=N(E anterior)+N(C)-N(D)`). Ojo: Leticia, Jesús y Luna tienen C y D invertidas (C = haber, D = debe).
- **Platos**: precio por porción con **25% de recargo** (hoja "Platos" de Precios La Caleta). **Mercadería**: al costo, con IVA, sin recargo (hoja "Mercadería").
- Descripción con cantidad y unidad: `Queso barra 0,125 kg`, `Empanada salteña 4 u`. Si falta precio: `(FALTA PRECIO)` / `(FALTA RECETA)` y monto vacío.
- **Tope de adelanto en efectivo: $150.000 por semana** por persona. Si se pasa, se anota un renglón de aviso.
- La leche que llevan los socios es **Tregar** ($2.012,23), no la común.
- Ajustes de semanas anteriores: renglón `Ajuste <producto> dd/mm: <motivo>` con la diferencia.

Al revisar una semana, chequeá cada renglón contra la lista de precios (precio unitario × cantidad), duplicados, fechas fuera de orden, productos sin precio y el tope. Errores ya vistos que se repiten: precio del bulto cargado como unidad o al revés (patitas "bolsa 5 kg" a $9.000 cuando la bolsa sale $48.000), un producto cargado al precio de otro (tónica al precio de la Coca, Topline al precio del Beldent).

**Mensajes de WhatsApp**: formato en `references/adelantos.md`. Claude no puede leer WhatsApp (no hay conector). Si hay que controlar un mensaje enviado, pedí que lo peguen, manden captura o exporten el chat a Drive. Al generar mensajes, guardá también una copia en Drive para poder revisarlos después.

## Precios de proveedores y facturas

Detalle en `references/precios-y-facturas.md`. Lo esencial:

- **Regla de carga: precio final con IVA, con el descuento ya aplicado, por unidad de uso** (kg, litro, unidad). Siempre declarar el formato de compra ("bolsa 25 kg", "caja x6", "atado 180 g") y que la planilla calcule la unidad.
- Facturas y remitos en Drive (carpeta "Facturas <Mes>"). Verificá cada comprobante: renglones suman el subtotal, subtotal + impuestos = total.
- Remitos manuscritos (verdulería, carnicería): el lector de texto de Drive los devuelve vacíos. **Bajá la imagen y mirala**; validá que los renglones sumen el total escrito.
- Marcá aparte: proformas (precio ofertado, no facturado), comprobantes "no válido como factura", facturas sin detalle ("gastos varios"), notas de crédito no descontadas.
- Hoy hay dos copias de la lista de precios; la buena es **"Precios La Caleta"** (carpeta ADELANTOS). La "(lista completa)" quedó atrasada. Objetivo: una sola.

## Recetas y costeo

Detalle en `references/recetas.md`. Lo esencial:

- Archivo vigente de Laura: `COSTOS RECETAS 2022 ... V7` (Excel, ~626 hojas, una ficha por hoja, hoja `LISTA` con los insumos, hoja `RESUMEN COSTOS` con costo y costo para adelantos).
- Hay recetas que usan otras recetas (hasta 4 niveles). **Una sub-receta entra siempre por su costo por porción (o por kg), nunca por su precio de venta ni por el costo de toda la tanda.**
- La mano de obra **no** va en el costo del plato: es costo fijo (retiros de asociados). Se mide aparte (horas de cocina).
- Costo real de un plato = materia prima + **28,9% del precio de venta** (estructura de agosto 2026: retiros, servicios, taxi, mantenimiento). Recalcular si cambia la estructura.
- Plan en curso: pasar todo a una sola Google Sheet (Proveedores → Insumos → Recetas → Costos → Revisar) donde un cambio de precio se propaga solo por todos los niveles.

## Ventas, informes y otros sistemas

- Ventas: sistema **Resto Soft**. No hay conector; se exporta el informe a una carpeta de Drive y se lee de ahí.
- Informes para el consejo: se mandan por WhatsApp a Matías, que los reenvía al grupo del consejo (un bot oficial no puede escribir en un grupo común).
- Amplitude (plan gratuito, proyecto "default", vacío al 28/10/2026) se evalúa para rankings de ventas como eventos. Recetas y plata quedan en Sheets. Nunca pedir que peguen la API key en el chat.
- Bot de WhatsApp para que los socios carguen sus consumos: API oficial de Meta con chip propio (no bots no oficiales: riesgo de bloqueo). Alternativa gratis: Telegram.

## Dónde está cada cosa

IDs de Drive y archivos en `references/drive.md`. Buscá ahí antes de buscar en todo el Drive.
