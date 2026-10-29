---
name: la-caleta
description: "Reglas y contexto de La Caleta, la cooperativa gastronómica del Yacht Club Rosario: adelantos semanales de los asociados y sus mensajes de WhatsApp, precios de proveedores, facturas y remitos, costeo de recetas (sub-recetas incluidas), ventas de Resto Soft e informes para el consejo. Usalo siempre que se hable de La Caleta, la cooperativa, un asociado por su nombre (Silvia, Yas, Romi, etc.), adelantos, devoluciones, la planilla de precios, la planilla de costos de recetas, Verdu Jorge u otro proveedor, facturas de la carpeta de Drive, el 25% de recargo o el costo de un plato, aunque no se nombre a La Caleta."
---

# La Caleta

Cooperativa gastronómica que atiende el restaurante del Yacht Club Rosario (solo socios del club). Quien escribe suele ser Matías, que lleva la administración junto a la sindicatura.

Claude no tiene memoria entre chats, y Matías usa chats distintos para cada tema (uno de adelantos, otro de facturas y precios, otro de recetas). Lo que conecta a esos chats son dos cosas:

- **Este skill**: las reglas fijas.
- **La bitácora**: la planilla de Google **"Bitácora La Caleta"** (ID `1WmRFsbXJ6XbBtsU1Xaa31PoRm2MUAbmho5afuSWNn10`, carpeta ADELANTOS). Columnas: Fecha · Chat (adelantos / precios / facturas / recetas / otro) · Tipo (Hecho / Pendiente) · Detalle · Estado (Abierto / Resuelto).

Cómo usar la bitácora:
1. **Al empezar**, leé los pendientes "Abierto" (sobre todo los de tu tema y los de precios, porque afectan a todos) y mencioná en una línea los que tocan lo que te piden.
2. **Al terminar algo importante**, agregá renglones debajo del último, escribiendo con un rango explícito (por ejemplo `'Bitácora'!A25:E26`): lo que se hizo y lo que quedó pendiente, con el chat que corresponde. Un renglón por cosa, en lenguaje simple, con montos y nombres.
3. **Si resolviste un pendiente** (aunque lo haya anotado otro chat), cambiá su Estado a "Resuelto" y agregá un renglón "Hecho" que diga cómo se resolvió.
4. **Si cambiaste un precio** en "Precios La Caleta", anotalo siempre: el chat de adelantos cobra con esos precios.

## Cómo hablarle a Matías

- Español rioplatense (vos), simple, sin jerga técnica. No es programador.
- Corto y de a una cosa. Una vez pidió "dame un respiro" después de una respuesta larga: priorizá lo importante, ofrecé el resto en una línea.
- Primero el resultado (qué está bien, qué hay que corregir y cuánta plata es), después el detalle.
- Los montos en formato argentino: $1.234,56.

## Antes de tocar cualquier planilla

- Leé de nuevo justo antes de escribir: hay otras personas que editan las planillas.
- Cambios de datos (precios, montos, renglones de adelantos): mostrá lo que vas a cambiar y pedí confirmación. Ordenar o formatear sin cambiar montos se puede hacer directo si lo pidió.
- Nunca escribas un número calculado a mano donde va una fórmula. Las columnas de saldo son fórmulas: no las pises.
- Después de escribir, releé y verificá que los totales sigan dando.

## Adelantos (planilla semanal)

La referencia completa y vigente es `references/adelantos.md` (viene del chat de adelantos y manda sobre todo lo demás). **Leela entera antes de cargar o revisar una semana.** Lo esencial:

- Una pestaña por socio. Lo que cada uno se lleva (mercadería, platos, efectivo) sale del grupo de WhatsApp **"Adelantos Coope"**, que se lee por WhatsApp Web cuando el chat tiene navegador. Si no lo tiene (por ejemplo, desde el celular), pedile a Mat que pegue los mensajes.
- Cada semana: encabezado `SEMANA DEL dd/mm AL dd/mm` en la columna A, en negrita negra; después la **Devolución** (monto de la foto "DEVUELVEN" del sábado; nunca saltearla) y después los movimientos por fecha.
- Columnas `A Fecha | B Concepto | C Debe | D Haber | E Saldo`, con el saldo como fórmula `=N(E{fila-1})+N(C{fila})-N(D{fila})`. Fechas como texto `dd/mm/aaaa`. En Leticia, Jesús y Luna se vieron filas viejas con C y D invertidas: mirá la fórmula antes de escribir.
- **Escribí siempre con rango explícito, nunca con `append_values`**: inserta filas en el medio de la pestaña.
- **Mercadería al costo** (sin recargo, aunque el socio ponga +25%). **Platos = CD de la ficha (con mano de obra) ÷ porciones × 1,25.**
- **Precio vigente el día que se lo llevó**: un aumento posterior no le aplica. Lo que se vende por presentación (lata, paquete, caja) se cobra por presentación, nunca por kilo.
- Equivalencias fijas (leche = Tregar, chicle = Beldent, Topline, dulce de leche Vacalín, etc.) en la referencia.
- **Tope de efectivo: $150.000 por socio por ciclo.** Si se pasa, se carga igual y se marca en el mensaje.
- Cumples: se cargan a todos menos el cumpleañero y Jesús.
- Correcciones de semanas cerradas: fila `Ajuste …` en la semana actual. No se tocan las semanas cerradas.
- Montos raros o líneas repetidas: preguntar antes de cargar.

**Mensajes**: van al chat de WhatsApp **"La Caleta"**, listos para copiar (nunca en un .txt). Llevan saludo, los movimientos de la semana por fecha, el total de la semana y el link a las listas de precios. **No llevan devolución ni saldo anterior.** El formato exacto está en la referencia. Si un mensaje ya salió con un error, se manda un ajuste aparte.

## Precios de proveedores y facturas

Detalle en `references/precios-y-facturas.md`. Lo esencial:

- **Cada vez que se actualizan precios en las listas de adelantos, cambiar la fecha del encabezado** ("Actualizado al dd/mm/aaaa", fila 2 de Platos y Mercadería) a la fecha del día (pedido de Mat).
- Hay **dos planillas de precios y las dos se usan**: "Precios La Caleta" (la maestra) y "Precios La Caleta (lista completa)", que es la que ven los socios. **Todo cambio de precio se hace en las dos**, y si corresponde se regenera el PDF de la carpeta de socios. El PDF viejo se mueve a ADELANTOS como "(viejo dd-mm)" y nunca se borra.
- Las pestañas "Por proveedor" y "Proveedores" de la lista completa se borraron el 29/10 (copias viejas sin uso): los precios de proveedores viven en las hojas de COSTOS RECETAS.
- **Regla de carga: precio final con IVA, con el descuento ya aplicado, por unidad de uso** (kg, litro, unidad), declarando el formato de compra. **Las facturas A son netas: hay que sumar 21% de IVA.**
- Germar o Cepro: vale el precio del proveedor donde se compró último.
- Facturas y remitos en Drive (carpeta "Facturas <Mes>" y otras). Verificá cada comprobante: los renglones suman el subtotal y el subtotal más impuestos da el total.
- Remitos manuscritos (verdulería, carnicería): el lector de texto de Drive los devuelve vacíos. **Bajá la imagen y mirala**, y validá que los renglones sumen el total escrito.
- Marcá aparte: proformas (precio ofertado, no facturado), comprobantes "no válido como factura", facturas sin detalle ("gastos varios") y notas de crédito no descontadas.

## Recetas y costeo

Detalle en `references/recetas.md`. Lo esencial:

- Archivo vigente: `COSTOS RECETAS 2022 ... V7` (Excel, ~626 hojas, una ficha por hoja, hoja `LISTA` con los insumos, hoja `RESUMEN COSTOS` con costo y costo para adelantos).
- Hay recetas que usan otras recetas (hasta 4 niveles). **Una sub-receta entra siempre por su costo por porción (o por kg), nunca por su precio de venta ni por el costo de toda la tanda.**
- **La mano de obra va en las recetas** (renglón "TIEMPO" de cada ficha) y forma parte del CD que se usa para el precio de adelantos. Es una decisión de Mat y por ahora no se cambia. **No la saques, no la separes y no propongas sacarla** al migrar fichas, armar la planilla única ni hacer análisis. Antecedente: un análisis anterior la trató como costo fijo y la dejó afuera del costo del plato; eso le trajo a Mat un problema muy serio con la cooperativa y casi le cuesta el proyecto.
- **Nombres en recetas y costos**: no nombres a quién armó o mantiene las fichas, ni en respuestas, ni en informes, ni en la bitácora. Hablá de "las fichas", "la planilla de costos" o "el costeo". Lo dudoso se le plantea solo a Mat. (En adelantos, cada socio se nombra normalmente por su pestaña.)
- **Cambios de criterio de costeo** (qué entra en el costo, recargos, cómo se prorratea): nunca los apliques ni los presentes como decididos. Si ves algo para mejorar, planteáselo a Mat en privado, como pregunta, y esperá su decisión.
- En la lista de Platos para adelantos quedaron afuera las fichas que tienen el costo de la receta entera en vez de la porción, los promedios y las bebidas por medida con costos viejos.
- Plan en curso: pasar todo a una sola Google Sheet (Proveedores → Insumos → Recetas → Costos → Revisar) donde un cambio de precio se propaga solo por todos los niveles.

## Ventas, informes y otros sistemas

- Ventas: sistema **Resto Soft**. No hay conector; se exporta el informe a una carpeta de Drive y se lee de ahí.
- Caja de Resto Soft: los servicios (EPE, Litoral Gas, Clean City, seguros) figuran con salida $0 y el importe escrito en el concepto porque **se pagan por transferencia o a cuenta con el club**. No es un error de carga. El importe real está en el concepto. Los gastos que manda Belén, la tesorera, por mensaje (débitos bancarios: DREI, ETUR, IVA, monotributo, seguros, contadora, Macellari, periódico, mant. cuenta, déb. y créd., Prosegur, Mercado Pago, Spotify, Resto Soft, abono celular) se cargan **solo** en la hoja Resumen de "La Caleta 2026 — mes a mes", en las filas de cada rubro (20 a 34, con los mismos nombres que usa Belén), en la columna del mes. **Nada en pestañas ni hojas aparte**: Mat quiere todo junto en la misma hoja. La planilla vieja "GASTOS 2026" ya no se usa: Mat no quiere dos planillas conviviendo. Lo que ya está en el sistema (caja de Resto Soft: taxi, proveedores, hielo, mantenimiento, personal, retiros y servicios anotados en el concepto) no se copia ahí. Macellari y Resto Soft se anotan pero no se suman en el Resumen porque ya están en las compras del sistema. No armar planillas nuevas.
- Retiros en la caja de Resto Soft: de enero a junio 2026 se anotaban por socio en PERSONAL ("RETIRO xx HS. $tarifa ($transferencia)": la salida es el efectivo y lo de entre paréntesis lo transferido; en mayo-junio "RETIRO $ transferencia" con la salida en efectivo) y los extras/vacaciones aparte con el importe en el concepto; desde julio van juntos en EGRESOS VARIOS "RETIRO DE ASOCIADXS (TRANSF. $x)". Las compras del sistema ya incluyen hielo, aceite, panadería, Plastipel, limpieza, Macellari, Resto Soft y Extintec: no sumarlas desde GASTOS.
- Informes para el consejo: **solo cuando Mat los pide**; no los armes por iniciativa propia. Se mandan por WhatsApp a Matías, que los reenvía al grupo del consejo (un bot oficial no puede escribir en un grupo común).
- Amplitude (plan gratuito, proyecto "default", vacío al 28/10/2026) se evalúa para rankings de ventas como eventos. Recetas y plata quedan en Sheets. Nunca pedir que peguen la API key en el chat.
- Bot de WhatsApp para que los socios carguen sus consumos: API oficial de Meta con chip propio (no bots no oficiales: riesgo de bloqueo). Alternativa gratis: Telegram.

## Dónde está cada cosa

IDs de Drive y archivos en `references/drive.md`. Buscá ahí antes de buscar en todo el Drive.
