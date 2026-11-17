/**
 * @OnlyCurrentDoc
 * Botón "La Caleta → Nueva semana" de la planilla Proporcionales (la de Belén).
 *
 * Belén nombra las hojas así (semana de sábado a viernes):
 *   horas:   "7 al 13-11-26"  (si cruza de mes: "28-11 al 4-12-26")
 *   retiro:  "detalle 14-11"  (el sábado en que se paga esa semana)
 * El botón crea las dos hojas de la semana de hoy si no existen (copiando las de la semana anterior,
 * con los mismos números para que ella los pise, como hacía a mano), les pone la columna
 * "HS según la app" conectada a la app de horarios y apunta la pestaña MENSAJES a la semana que se paga.
 */

const HORARIOS_ID = "1xzxVI1RdvovdZLKhxGl-mNRSmlAm67fOvDPQGQgweu4";   // planilla "Horarios La Caleta" (hoja PARA PROPORCIONALES)
const DIA = 86400000;

function onOpen() {
  SpreadsheetApp.getUi().createMenu("La Caleta")
    .addItem("Nueva semana", "nuevaSemana")
    .addItem("Actualizar los mensajes de retiro", "actualizarMensajes")
    .addToUi();
  try { apuntarMensajes(); } catch (e) {}   // al abrir, MENSAJES ya queda en la semana que se paga
}

/* ---------- fechas ---------- */
function soloFecha(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function mas(d, dias) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias); }
/** El sábado de la semana (sábado a viernes) en que cae la fecha. */
function sabadoDe(d) { d = soloFecha(d); return mas(d, -((d.getDay() + 1) % 7)); }
function igual(a, b) { return a && b && a.getTime() === b.getTime(); }
function anioCercano(dia, mes, hoy) {
  let mejor = null;
  [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1].forEach(y => {
    const f = new Date(y, mes - 1, dia);
    if (!mejor || Math.abs(f - hoy) < Math.abs(mejor - hoy)) mejor = f;
  });
  return mejor;
}

/* ---------- nombres de las hojas ---------- */
/** "7 al 13-11-26" / "31-10 AL 6-11-26" → {inicio, fin}, o null si no es una hoja de horas. */
function leerHoras(nombre) {
  const m = String(nombre).trim().match(/^(\d{1,2})(?:[-.\/](\d{1,2}))?\s+al\s+(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{2}|\d{4})$/i);
  if (!m) return null;
  const y = Number(m[5]) < 100 ? 2000 + Number(m[5]) : Number(m[5]);
  const fin = new Date(y, Number(m[4]) - 1, Number(m[3])), inicio = mas(fin, -6);
  if (inicio.getDate() !== Number(m[1])) return null;
  return { inicio: inicio, fin: fin };
}
/** "detalle 14-11" → fecha de pago, o null. */
function leerDetalle(nombre, hoy) {
  const m = String(nombre).trim().match(/^detalle\s+(\d{1,2})[-.\/](\d{1,2})$/i);
  return m ? anioCercano(Number(m[1]), Number(m[2]), hoy) : null;
}
function nombreHoras(inicio) {
  const fin = mas(inicio, 6), yy = String(fin.getFullYear()).slice(-2);
  return inicio.getMonth() === fin.getMonth()
    ? inicio.getDate() + " al " + fin.getDate() + "-" + (fin.getMonth() + 1) + "-" + yy
    : inicio.getDate() + "-" + (inicio.getMonth() + 1) + " al " + fin.getDate() + "-" + (fin.getMonth() + 1) + "-" + yy;
}
function nombreDetalle(pago) { return "detalle " + pago.getDate() + "-" + (pago.getMonth() + 1); }

/* ---------- buscar hojas ---------- */
function hojasHoras(ss) { return ss.getSheets().map(h => ({ hoja: h, f: leerHoras(h.getName()) })).filter(x => x.f); }
function hojasDetalle(ss, hoy) { return ss.getSheets().map(h => ({ hoja: h, f: leerDetalle(h.getName(), hoy) })).filter(x => x.f); }
function buscarHoras(ss, inicio) { const x = hojasHoras(ss).filter(x => igual(x.f.inicio, inicio))[0]; return x ? x.hoja : null; }
function buscarDetalle(ss, pago, hoy) { const x = hojasDetalle(ss, hoy).filter(x => igual(x.f, pago))[0]; return x ? x.hoja : null; }

/* ---------- el botón ---------- */
function nuevaSemana() {
  const ss = SpreadsheetApp.getActive(), hoy = soloFecha(new Date());
  const inicio = sabadoDe(hoy), fin = mas(inicio, 6), pago = mas(inicio, 7);
  const creadas = [];

  let horas = buscarHoras(ss, inicio);
  if (!horas) {
    const ultima = hojasHoras(ss).filter(x => x.f.inicio < inicio).sort((a, b) => b.f.inicio - a.f.inicio)[0];
    if (!ultima) throw new Error("No encontré ninguna hoja de horas anterior para copiar.");
    horas = ultima.hoja.copyTo(ss).setName(nombreHoras(inicio));
    horas.getRange("B1").setValue(inicio.getDate() + " AL " + fin.getDate() + "/" + (fin.getMonth() + 1) + "/" + fin.getFullYear());
    creadas.push(horas.getName());
  }
  let detalle = buscarDetalle(ss, pago, hoy);
  if (!detalle) {
    const ultimo = hojasDetalle(ss, hoy).filter(x => x.f < pago).sort((a, b) => b.f - a.f)[0];
    if (!ultimo) throw new Error("No encontré ninguna hoja de detalle anterior para copiar.");
    detalle = ultimo.hoja.copyTo(ss).setName(nombreDetalle(pago));
    detalle.getRange("B2").setValue(inicio.getDate() + " AL " + fin.getDate() + "-" + (fin.getMonth() + 1) + "-" + fin.getFullYear());
    creadas.push(detalle.getName());
  }
  // orden: al final, horas y después detalle
  ss.setActiveSheet(horas); ss.moveActiveSheet(ss.getNumSheets());
  ss.setActiveSheet(detalle); ss.moveActiveSheet(ss.getNumSheets());

  conectarHoras(horas, inicio);
  apuntarMensajes();
  ss.setActiveSheet(horas);
  SpreadsheetApp.getUi().alert(creadas.length
    ? "Listo. Se crearon: " + creadas.join(" y ") + ".\n\nSon copia de la semana anterior: pisá los números con los de esta semana.\nLa columna L trae las horas de la app."
    : "Las hojas de esta semana ya estaban (" + horas.getName() + " y " + detalle.getName() + "). Les dejé conectadas las horas de la app.");
}

/** Menú "Actualizar los mensajes de retiro": apunta MENSAJES a la semana que se paga y avisa. */
function actualizarMensajes() {
  const r = apuntarMensajes();
  SpreadsheetApp.getUi().alert(r ? "Los mensajes quedaron con " + r.detalle + " y " + r.horas + "." : "No encontré las hojas de la semana que se paga. Fijate que existan.");
}

/** La semana que se paga es la que terminó el viernes anterior al último sábado (hoy incluido). */
function apuntarMensajes() {
  const ss = SpreadsheetApp.getActive(), hoy = soloFecha(new Date());
  const pago = sabadoDe(hoy), inicio = mas(pago, -7);
  const detalle = buscarDetalle(ss, pago, hoy), horas = buscarHoras(ss, inicio), msj = ss.getSheetByName("MENSAJES");
  if (!detalle || !horas || !msj) return null;
  if (msj.getRange("B1").getDisplayValue() !== detalle.getName()) msj.getRange("B1").setValue(detalle.getName());
  if (msj.getRange("B2").getDisplayValue() !== horas.getName()) msj.getRange("B2").setValue(horas.getName());
  conectarHoras(horas, inicio);
  return { detalle: detalle.getName(), horas: horas.getName() };
}

/** Columna L "HS según la app": trae las horas de cada socio desde la app de horarios (hoja PARA PROPORCIONALES). */
function conectarHoras(hoja, inicio) {
  const u = '"' + HORARIOS_ID + '"';
  hoja.getRange("L1").setValue("HS según la app → semana desde:");
  // la fecha va como fórmula para que no la corra la zona horaria; la planilla está en español: separador ";"
  hoja.getRange("M1").setFormula("=DATE(" + inicio.getFullYear() + ";" + (inicio.getMonth() + 1) + ";" + inicio.getDate() + ")").setNumberFormat("d/m/yyyy");
  hoja.getRange("N1").setValue("✓ conectada con la app de horarios");
  const nombres = hoja.getRange(2, 1, 20, 1).getDisplayValues();
  for (let i = 0; i < nombres.length; i++) {
    if (!String(nombres[i][0]).trim()) continue;
    const f = i + 2;
    const formula = "=IFERROR(INDEX(IMPORTRANGE(" + u + ";\"PARA PROPORCIONALES!C4:Z25\");MATCH(TRIM($A" + f + ");IMPORTRANGE(" + u +
      ";\"PARA PROPORCIONALES!A4:A25\");0);MATCH($M$1;IMPORTRANGE(" + u + ";\"PARA PROPORCIONALES!C3:Z3\");0));\"\")";
    try { if (hoja.getRange(f, 12).getFormula() !== formula) hoja.getRange(f, 12).setFormula(formula); } catch (e) {}   // una celda combinada (nota de Belén) se saltea
  }
}
