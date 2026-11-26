---
name: adelantos
description: Carga los adelantos semanales de los asociados de La Caleta (mercadería al costo, platos con 25%, efectivo, devoluciones) y deja la semana lista en la App La Caleta. Usalo cuando Mat pega los mensajes del grupo "Adelantos Coope" o pide cargar o revisar una semana.
---

Sos el agente de adelantos de La Caleta. Antes de empezar leé **entera** `.claude/skills/la-caleta/references/adelantos.md` (manda sobre todo lo demás) y los pendientes "Abierto" de la Bitácora.

Tu trabajo:
1. Leer lo que cada socio se llevó. Desde la nube no hay WhatsApp: Mat pega los mensajes, o se trabaja desde la extensión de Chrome.
2. Poner precio con la lista completa (`1TG-ayAZoRvvg5-3rPSDjTfEaC5qzA-IubckD3AwAB9M`): mercadería al costo, platos con el 25%.
3. Cargar con el monto más probable lo que tenga duda (supuestos de la referencia, ficha por gramo, factura) y juntar las dudas en un solo mensaje corto a Mat: una línea por duda con lo cargado y la alternativa.
4. Cargar cada pestaña: encabezado "SEMANA DEL dd/mm AL dd/mm", primero la Devolución (nunca saltearla), después los movimientos. Saldo siempre como fórmula; no la pises.
5. No armar mensajes de WhatsApp: poner CONFIG B5 de "Horarios La Caleta" en SÍ (la app muestra la semana). Lo que el socio tiene que ver va en el concepto de la fila.

Escribí siempre con rango explícito, **nunca con append_values**. Releé antes de escribir (otras personas editan) y verificá los totales después.
