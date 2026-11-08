# Horarios La Caleta (app en Google)

Planilla: "Horarios La Caleta" en la carpeta "La Caleta — Sistema" de Drive
(ID `1xzxVI1RdvovdZLKhxGl-mNRSmlAm67fOvDPQGQgweu4`).

## Instalar (una sola vez, desde la compu)

1. Abrir la planilla "Horarios La Caleta".
2. Extensiones → Apps Script.
3. En el archivo `Código.gs` que aparece, borrar todo y pegar el contenido de `Codigo.gs`.
4. Botón "+" al lado de Archivos → HTML → nombre `Index` (sin .html). Borrar lo que trae y pegar `Index.html`.
5. Guardar (ícono del disquete).
6. Arriba elegir la función `instalar` → Ejecutar. Google pide permiso: Revisar permisos → elegir la cuenta →
   "Configuración avanzada" → "Ir a Horarios La Caleta (no seguro)" → Permitir. (Dice "no seguro" porque el
   programa es tuyo y no está verificado por Google.)
7. Implementar → Nueva implementación → tipo "Aplicación web". Ejecutar como: **Yo**. Quién tiene acceso:
   **Cualquier persona**. Implementar → copiar la URL que termina en `/exec`. Ese es el link de la app.

## Hojas

- **SEMANA**: la semana de sábado a viernes (cambiar la fecha amarilla para ver otra). Horas por día, HS,
  pago de horas (con multiplicador de feriado), propina proporcional a las horas y total.
- **Liquidación (en SEMANA)**: Pago horas = horas × valor hora (× feriado); Propina = propina de la semana
  (celda R1) × horas de cada uno ÷ horas de todos; a mano (amarillo): Extra y su detalle (ej. "Evento Rozzi"),
  Cuota préstamo, Adelantos y Efectivo. TOTAL = horas + propina + extra − préstamo − adelantos;
  Transferencia = TOTAL − Efectivo. Menú **La Caleta → Armar mensajes de cobro** deja en la columna Mensaje el
  texto para WhatsApp; **Guardar liquidación de la semana** la copia a una hoja "Liq dd-mm-aaaa" y limpia lo
  cargado a mano. Antes de liquidar, poner en la celda amarilla C1 el sábado de la semana que se paga.
- **PERSONAL**: nombre, PIN (4 números; vacío = cada uno lo elige la primera vez que usa la app; para resetearlo, borrarlo), valor hora, activo (NO = dado de baja).
- **MARCAS**: cada turno (fecha, nombre, entrada, salida, horas). Se corrige a mano acá.
- **Ubicación**: al marcar, el celular pide permiso de ubicación. En MARCAS quedan "En el club al entrar / al
  salir" (SÍ/NO y la distancia; NO en rojo) y las coordenadas. Nunca bloquea: sin permiso queda "sin dato".
  Salida olvidada: si una entrada lleva más de 14 h abierta, la app muestra "⚠ Falta marcar la salida" y el socio
  carga la hora; queda en amarillo con Origen "olvido: ..." para revisar.
  El punto del club y el radio (150 m) están en la hoja **CONFIG**; para afinarlo, copiar ahí la ubicación de
  una marca hecha en el club.
- **FERIADOS**: fecha (AAAA-MM-DD), motivo y por cuánto se multiplica la hora.

## Página lacaleta.ycr.com.ar/app (WordPress)

La página "App" está en el editor clásico: todo su contenido es el texto de `wordpress-app.html` (arregla el
zoom y muestra el botón "¿No carga? Tocá acá para abrir la app" si Google falla a los 9 segundos).

## Cambios en el código

Después de cambiar el código: Implementar → Administrar implementaciones → lápiz → Versión: "Nueva versión"
→ Implementar. Así el link sigue siendo el mismo.

Pendiente (tesorera): de dónde sale el monto de la propina, pago de feriados y otros adicionales.
