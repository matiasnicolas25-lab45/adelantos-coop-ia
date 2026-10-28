# Adelantos: detalle

Fuente: el CLAUDE.md del chat de adelantos (pasado por Matías el 28/10/2026). Es la referencia vigente de cómo se cargan los adelantos y cómo se arman los mensajes; manda sobre cualquier otra versión. El historial y los pendientes que traía se pasaron a la bitácora de Drive.

## 1. Archivos (Google Drive)

| Qué | ID | Notas |
|---|---|---|
| Planilla de adelantos ("ADELANTOS DEL …") | `1p9VNq6C5nrnmRZyosf9MEbMDYUmOQnypyrLVVa31oB8` | Una pestaña por socio |
| Precios La Caleta (maestra) | `1q17AXG0q01wCKnyayCaG_dBqWvlthWUr8EH_MauzOXw` | Pestañas: Mercadería, Platos, Por proveedor (fórmula, no editar), Proveedores |
| Precios La Caleta (lista completa, la ven los socios) | `1TG-ayAZoRvvg5-3rPSDjTfEaC5qzA-IubckD3AwAB9M` | Copia que hay que mantener igual a la maestra |
| Carpeta "Listas de precios La Caleta" (socios) | `1quRYus4l1p-_RjsQ2Hebry6i5yeYnWDZ` | Link que va en cada mensaje |
| Carpeta ADELANTOS (interna) | `1AYLEqRNqdpJiAizvxTH4ZUq2AiDSGzFl` | Acá van los PDF viejos renombrados "(viejo dd-mm)" |
| PDF "Precios Recetas" vigente (22/10) | `1dUkvgSqT1i_G9TCiWwvBrqkSJXfhbUqM` | 467 platos, en carpeta socios |
| Boletas de proveedores | carpeta `1dIVyu3RbbAdPCB9bNEHtDtG5HNEJ7TlH` (y otras) | Frío Net, carnicería, etc. |

Link para los socios: https://drive.google.com/drive/folders/1quRYus4l1p-_RjsQ2Hebry6i5yeYnWDZ

Cada cambio de precio se hace en **las dos** planillas de precios (maestra + lista completa) y, si corresponde, se regenera el PDF de la carpeta de socios (el viejo se mueve a ADELANTOS, nunca se borra).

---

## 2. Socios y pestañas

Nombres exactos de pestaña (varios tienen espacio al final):
`'alejandra '`, `ana`, `'belen '`, `'brian '`, `'franco '`, `Jesús`, `'julia '`, `laura`, `Leticia`, `luis`, `luna`, `'matias '`, `moni`, `'nati '`, `'raquel '`, `romi`, `'silvia '`, `yas`, `'yoa '`

| Pestaña | Nombre en WhatsApp / mensajes | sheetId |
|---|---|---|
| alejandra | Alejandra Luque / Ale | 1127783572 |
| ana | Ana J Francesio / Anita | 1010441007 |
| belen | Belen Marting / Belu | 1265679102 |
| brian | Brian Friz | 210601344 |
| franco | Franco | 1112702596 |
| Jesús | — (cuenta especial, no paga cumples) | 1207270046 |
| julia | Julia Medina / Juli | 1140771955 |
| laura | Lau Roman / Lau | 463646368 |
| Leticia | LETICIA SPINOZZI / "lelibelula" / Leti | 1754606787 |
| luis | Luismi / Luis Coope | 2146670555 |
| luna | Luna | 1391000139 |
| matias | Matías Coope / Mati (es Mat) | 1577737600 |
| moni | Moni Castillo | 606993401 |
| nati | Natalia Cesatti / Naty | 1278716309 |
| raquel | Raquel Rojkin | 1969723836 |
| romi | Romina / Romi Coope | 1608700100 |
| silvia | Silvia Castillo | 125708801 |
| yas | Yasmi / Yasmila | 1791820961 |
| yoa | Yoa / Yoana | 451046591 |

---

## 3. Flujo semanal

1. Leer el grupo de WhatsApp **"Adelantos Coope"** (WhatsApp Web). Mat indica desde qué mensaje arrancar y dónde cortar. Lo que llega después del corte queda para la semana siguiente.
2. WhatsApp Web carga los mensajes de a partes: hacer scroll y juntar todos (`[data-pre-plain-text]`). Antes de armar mensajes, volver a revisar por si alguien **editó o reenvió** un mensaje.
3. En cada pestaña, después de la última fila:
   - Fila encabezado: `SEMANA DEL dd/mm AL dd/mm` en **columna A, negrita, letra negra**.
   - Primera fila después: **Devolución** (HABER), monto de la foto "DEVUELVEN" que se comparte los sábados en el grupo. Nunca saltearla.
   - Luego los movimientos.
4. Columnas: `A Fecha | B Concepto | C Debe | D Haber | E Saldo`.
   - Saldo: `=N(E{fila-1})+N(C{fila})-N(D{fila})`.
   - Fechas como texto `dd/mm/aaaa` (la API las interpreta como fecha).
5. **Escribir siempre con rango explícito** (`update_values` / `update_formulas`). **Nunca `append_values`**: inserta filas en el medio de la pestaña.
6. Dudas: concepto con `(FALTA …)` y sin monto.
7. Correcciones de semanas anteriores: fila `Ajuste …` en la semana actual (no tocar semanas cerradas).
8. Cumpleaños del ciclo (Mat avisa; si no avisa, no hubo).
9. Revisar topes de efectivo.
10. Armar los mensajes para cada socio (sección 7).

---

## 4. Reglas de precios

**Fuente:** pestañas Mercadería y Platos de "Precios La Caleta". Antes de preguntar un precio, buscarlo ahí, en Por proveedor/Proveedores y en las boletas de Drive.

- **Mercadería al costo**, sin recargo. Si un socio pone "+25%" en mercadería, se ignora.
- **Platos (elaborados)** = CD de la ficha (con mano de obra) ÷ porciones × 1,25.
- **Precio vigente el día que se lo llevó.** Si el precio sube después (boleta posterior), el aumento NO le aplica. Ej.: Franco muslo 20/10 a $7.000 (el aumento a $7.100 fue el 21/10); Ale pechuga 16/10 a $7.700 (no $7.900).
- **Unidades por presentación** (lata, paquete, botella, caja): se cobran a precio de presentación, nunca por kilo. Una lata de choclo no pesa un kilo.
- **Germar vs. Cepro:** el precio del proveedor donde se compró último.
- **Facturas A son netas:** sumar 21% de IVA.
- **Desconfiar de montos que no cierran** (ej. una bolsa de masticables a $60.000 era un cero de más: $5.001,29 + IVA = $6.051,56). Si un mensaje viene con una línea repetida o un monto raro, preguntar antes de cargar.
- Cada precio nuevo que aparezca (boleta, decisión de Mat) se carga en el momento en las dos planillas de precios.

### Equivalencias fijas

| Si el socio pide… | Se cobra |
|---|---|
| leche | Leche Tregar (litro) |
| fernet | Fernet Branca 1 L, $23.320 |
| picada / pulpa picada | Picada Especial (kg) |
| merluza rebozada | Merluza Finas Hierbas (kg) |
| arvejas congeladas | Cepro (kg) |
| manteca | Gastroinsumos $11.507,40/kg; Luis "la pauli" = La Paulina $16.830/kg |
| dulce de leche | Vacalín $4.356,50/kg mientras haya stock (en la lista están Vacalín y Eureka); en el adelanto escribir "Vacalín" |
| chicle | Beldent ($630,71) |
| topline | Chicle Topline 7 $818,42 (factura Arcor 15/10) |
| huevo kinder | $2.497,98 |
| coca / gaseosa grande, chica | Coca Grande 1,5 L / Coca Chica |
| barritas bon o bon | Oblea Bon o Bon |
| café con leche | el de cafetería, $1.149,79 |
| humus | porción de 75 g (prorratear) |
| puré | porción de 400 g |
| tuco | porción de 100 g (prorratear) |
| bondiola braseada "sola" | Bondiola braseada sin papas $8.301,18 |
| pata muslo | ver de qué compra salió: Camelia (Frío Net) $3.125/kg — caja $40.000 trae 12,8 kg; Piala $5.500/kg |
| muslo | Muslos (kg), según la boleta vigente de Frío Net |
| salmón crudo por peso | precio por kg con merma (Salmón limpio) |
| franui | por pote |
| Jorgito mini | por bandeja x6 |

---

## 5. Efectivo, devoluciones y cumples

- Monto en pesos sin descripción ("30 mil", "$50000") = **adelanto efectivo** (DEBE). No preguntar.
- "Devuelvo …" = HABER.
- **Tope efectivo: $150.000 por socio por ciclo.** Si se pasa, se carga igual y se marca en el mensaje.
- "lo retira / se lo lleva Yoa" → se le carga a quien lo pidió, no a Yoa.
- Uber sin monto: ignorar.
- **Cumples:** a todos los socios menos el cumpleañero y Jesús (Leticia incluida desde oct. 2026). Concepto `Cumple [Nombre]`.
  - Montos: Romi $8.550; Yoana (22/10) y Matías (18/10) $8.720 c/u (2026).

---

## 6. Revisión antes de cerrar la semana

- Encabezado en A, negrita negra, en todas las pestañas con movimientos.
- Devolución = foto DEVUELVEN.
- Fórmula de saldo correcta en cada fila, sin saltos.
- Cada cargo = precio de lista vigente × cantidad.
- Cumples en todos los que corresponde.
- Efectivo ≤ $150.000.
- Sin filas "(FALTA …)" pendientes, o avisadas.
- Cruzar mensaje por mensaje el grupo contra lo cargado.

---

## 7. Mensajes semanales a los socios

- Se mandan al chat de WhatsApp **"La Caleta"** (no por privado). Mat los copia desde el chat: entregarlos listos para copiar, nunca como .txt.
- Movimientos tal cual están en la planilla, ordenados por fecha. **Sin devolución, sin saldo anterior, sin explicar saldos a favor.**
- Formato:

```
¡Hola {Nombre}! 😊 Te paso tus movimientos de la semana del dd/mm al dd/mm:

dd/mm Concepto $monto
dd/mm Devolución Uber -$monto

Total de la semana: $total

Acá tenés las listas de precios para controlar 👇
https://drive.google.com/drive/folders/1quRYus4l1p-_RjsQ2Hebry6i5yeYnWDZ
```

- Total de la semana = suma de los movimientos de la semana (sin la devolución inicial).
- Sin saludo de cierre ("¡Gracias y que tengas…" no va). Sin texto sobre cómo pasar pedidos. Nada de 👋.
- Si es el cumple del socio, se puede sumar una línea de saludo.
- Si un mensaje ya salió y hay que corregir, mandar un **ajuste aparte** (no reescribir la línea original).

---

## 10. Errores que no hay que repetir

- Saltear la devolución del sábado.
- Encabezado fuera de la columna A o sin negrita.
- `append_values` (inserta filas en el medio).
- Cobrar por kilo lo que se vende por unidad.
- Usar precios viejos sin chequear la lista actual.
- Aplicar un aumento a algo que se llevaron antes del aumento.
- Aceptar montos absurdos sin preguntar.
- Preguntar precios que ya están en la lista.
- No volver a leer el grupo antes de cerrar (mensajes editados o reenviados).

---

## Notas agregadas desde otros chats

- Tónica 1,5 L figuraba en Mercadería a $3.375 (el precio de la Coca grande); la tónica sale $2.714 (Coca-Cola). Verificar antes de cobrarla.
- Patitas de pollo: Frío Net vende la bolsa de 5 kg a $48.000 ($9.600/kg). Una "bolsa 5 kg" a $9.000 es un error.
- Si no hay acceso a WhatsApp Web en el chat (por ejemplo, desde el celular), pedile a Mat que pegue los mensajes o exporte el chat a Drive.
