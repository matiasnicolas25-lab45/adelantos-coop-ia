# Adelantos: detalle

## Asociados (nombre de pestaña → nombre en el mensaje)

alejandra → Alejandra · ana → Ana Julia · belen → Belén · brian → Brian · franco → Franco · Jesús → Jesús · julia → Julia · laura → Laura · Leticia → Leticia · luis → Luis · luna → Luna · matias → Matías · moni → Mónica · nati → Natalia · raquel → Raquel · romi → Romina · silvia → Silvia · yas → Yasmila · yoa → Yoana

Varias pestañas tienen un espacio al final del nombre (`'alejandra '`, `'silvia '`, `'brian '`, etc.): en rangos A1 hay que ponerlas entre comillas con el espacio.

## Estructura de una semana

```
SEMANA DEL 01/10 AL 08/10 |                      |        |          | <saldo que arrastra>
03/10                     | Devolución           |        | 70246,29 | 203,91
01/10                     | Empanada salteña 4 u | 7996,64|          | 8200,55
06/10                     | Adelanto efectivo    | 100000 |          | ...
```

- La devolución del sábado va primera aunque haya consumos con fecha anterior (esos consumos se descuentan la semana siguiente).
- Debajo de la devolución, todo en orden de fecha. Para ordenar, ordená solo las columnas A:D de los renglones de consumo (la E es fórmula y se recalcula sola).
- Laura paga en partes: su devolución no deja el saldo en cero. Es normal.
- "Redondeo retiro" / "Redondeo saldo": diferencias por redondear el retiro en efectivo.
- Adelantos en efectivo chicos ($100, $200) en Laura aparecen seguido; si algo parece un cero de menos, preguntá.

## Formato del mensaje de WhatsApp (uno por asociado)

```
*LA CALETA · Adelantos*
*Ciclo 03/09 al 10/09*
*Alejandra*

Saldo anterior: $80.508,14
Devolución 05/09: -$80.647,67

*Movimientos del ciclo*
06/09 · Empanada salteña 2 u — $3.359,52
06/09 · Roll de salmón 2 u — pendiente de precio
08/09 · Adelanto efectivo — $50.000,00
Cumple Romi — $8.550,00

*Total a descontar: $64.174,35*
```

- Si el saldo final es negativo: `*Saldo a favor: $111,94*`.
- Sin consumos: `Sin movimientos en el ciclo.`
- Lo que no tiene precio va como "pendiente de precio" y se avisa aparte antes de mandar.
- El total del mensaje tiene que coincidir con el saldo final de la pestaña. Verificalo.
- Antecedente: página publicada "Adelantos Caleta 03–10/09" (claude.ai/artifact/HKHg6zuxXA7TCpXQHPemh2) con un botón "Copiar mensaje" por persona.

## Revisión semanal (checklist)

1. Cada renglón: precio unitario de la lista × cantidad = monto.
2. Platos con 25% (hoja Platos); mercadería al costo (hoja Mercadería).
3. Productos que no están en la lista o con precio de otro producto.
4. Renglones repetidos (mismo producto, misma cantidad, fechas cercanas): preguntar, no borrar.
5. Fechas fuera de orden.
6. Tope de $150.000 en efectivo por semana.
7. Pendientes "FALTA PRECIO/RECETA".
8. Total de cada pestaña vs. total del mensaje enviado.
