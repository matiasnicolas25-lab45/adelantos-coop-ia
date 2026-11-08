/**
 * Horarios La Caleta — app de entrada y salida montada en Google Sheets.
 *
 * Cada asociado abre el link, toca su nombre, pone su PIN y marca Entré / Salí.
 * Las marcas caen en la hoja MARCAS; la hoja SEMANA arma la semana de sábado
 * a viernes con horas, valor hora, feriados y propina proporcional a las horas.
 *
 * Instalación (una sola vez): ver LEEME.md en esta misma carpeta.
 * La pantalla (Index.html) va adentro de este archivo, en PANTALLA, al final: no hace falta otro archivo.
 */

const ZONA = "America/Argentina/Buenos_Aires";
const ADELANTOS_ID = "1p9VNq6C5nrnmRZyosf9MEbMDYUmOQnypyrLVVa31oB8";   // planilla "ADELANTOS DEL …" (una pestaña por socio)
const PRECIOS_ID = "1TG-ayAZoRvvg5-3rPSDjTfEaC5qzA-IubckD3AwAB9M";     // "Precios La Caleta (lista completa)", la que ven los socios
const ICONO = "https://drive.google.com/uc?export=view&id=1CsDX9Co-9A2gbOiBk54I8uIMxCdlTJV-&ext=.png";  // icono-la-caleta.png (Drive, público)
const LISTAS_PDF = "https://drive.google.com/drive/folders/1quRYus4l1p-_RjsQ2Hebry6i5yeYnWDZ";

/** Nombre en la app → pestaña en la planilla de adelantos (se compara sin espacios ni mayúsculas). */
const PESTANAS = {
  "Alejandra": "alejandra", "Ana Julia": "ana", "Belén": "belen", "Braian": "brian", "Franco": "franco",
  "Jesús": "jesús", "Julia": "julia", "Laura": "laura", "Leticia": "leticia", "Luis": "luis", "Luna": "luna",
  "Matías": "matias", "Mónica": "moni", "Natalia": "nati", "Raquel": "raquel", "Romina": "romi",
  "Silvia": "silvia", "Yasmila": "yas", "Yoana": "yoa",
};

const PERSONAL_INICIAL = [
  ["Alejandra", 8807], ["Ana Julia", 9069], ["Belén", 9243], ["Braian", 8894], ["Franco", 8894],
  ["Julia", 9941], ["Laura", 9941], ["Leticia", 7499], ["Luis", 9330], ["Luna", 8894],
  ["Matías", 9069], ["Mónica", 9766], ["Natalia", 9069], ["Raquel", 9941], ["Romina", 9156],
  ["Silvia", 9069], ["Yasmila", 8894], ["Yoana", 9069],
];

/* ---------------- web app ---------------- */

function doGet() {
  const pagina = HtmlService.createHtmlOutput(PANTALLA)
    .setTitle("La Caleta")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  try { pagina.setFaviconUrl(ICONO); } catch (e) {}   // el ícono del celular; si falla, la app anda igual
  return pagina;
}

/** Nombres y quién está adentro ahora (sin PIN ni valores). */
function estado() {
  const activos = leerPersonal().filter(p => p.activo);
  const personas = activos.map(p => p.nombre), sinPin = activos.filter(p => !p.pin).map(p => p.nombre);
  const sinCel = activos.filter(p => !p.cel).map(p => p.nombre);
  const abiertos = {};
  for (const m of leerMarcas()) if (!m.salida) abiertos[m.nombre] = { fecha: m.fecha, entrada: m.entrada };
  return { personas, sinPin, sinCel, abiertos, ahora: hora(new Date()), hoy: fecha(new Date()) };
}

/** Marca entrada ("in"), salida ("out") o una salida olvidada ("olvido", con `horaOlvido` = "HH:MM").
 * `pos` = {lat, lon, acc} del celular o null. */
function marcar(nombre, pin, tipo, pos, horaOlvido, cel) {
  const p = validar(nombre, pin);
  if (cel && !p.cel) {
    const n = String(cel).replace(/\D/g, "");
    if (n.length === 10) libro().getSheetByName("PERSONAL").getRange(p.fila, 5).setValue("'" + n);
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = libro().getSheetByName("MARCAS");
    const marcas = leerMarcas();
    const abierta = marcas.filter(m => m.nombre === p.nombre && !m.salida).pop();
    const ahora = new Date();
    const lugar = donde(pos);
    if (tipo === "in") {
      if (abierta) return { ok: false, texto: p.nombre + ", ya marcaste entrada a las " + abierta.entrada + ". Marcá la salida primero." };
      const fila = hoja.getLastRow() + 1;
      hoja.getRange(fila, 1, 1, 4).setValues([["'" + fecha(ahora), p.nombre, "'" + hora(ahora), ""]]);
      hoja.getRange(fila, 5).setFormulaR1C1('=IF(R[0]C[-1]="","",MOD(TIMEVALUE(R[0]C[-1])-TIMEVALUE(R[0]C[-2]),1)*24)');
      hoja.getRange(fila, 6, 1, 2).setValues([["app", ahora]]);
      hoja.getRange(fila, 8).setValue(lugar.texto);
      hoja.getRange(fila, 10).setValue(lugar.coord);
      return { ok: true, texto: "¡Listo " + p.nombre + "! Entraste a las " + hora(ahora) + "." + lugar.aviso + nuevoPin(p) };
    }
    if (!abierta) return { ok: false, texto: p.nombre + ", no tenés una entrada abierta. Marcá la entrada primero." };
    if (tipo === "olvido") {
      if (!/^\d{2}:\d{2}$/.test(String(horaOlvido))) return { ok: false, texto: "Poné la hora en que saliste." };
      hoja.getRange(abierta.fila, 4).setValue("'" + horaOlvido).setBackground("#fff2cc");
      hoja.getRange(abierta.fila, 6).setValue("olvido: salida cargada por el socio el " + Utilities.formatDate(ahora, ZONA, "dd/MM HH:mm")).setBackground("#fff2cc");
      return { ok: true, texto: "¡Listo " + p.nombre + "! Quedó tu salida a las " + horaOlvido + ". Matías la va a revisar." };
    }
    hoja.getRange(abierta.fila, 4).setValue("'" + hora(ahora));
    hoja.getRange(abierta.fila, 9).setValue(lugar.texto);
    hoja.getRange(abierta.fila, 11).setValue(lugar.coord);
    return { ok: true, texto: "¡Listo " + p.nombre + "! Saliste a las " + hora(ahora) + "." + lugar.aviso + nuevoPin(p) };
  } finally {
    lock.releaseLock();
  }
}

/** Horas de la persona en la semana actual (sábado a viernes). */
function misHoras(nombre, pin) {
  const p = validar(nombre, pin);
  const inicio = sabado(new Date());
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(inicio.getTime() + i * 86400000);
    dias.push({ fecha: fecha(d), turnos: [], horas: 0 });
  }
  for (const m of leerMarcas()) {
    if (m.nombre !== p.nombre) continue;
    const dia = dias.find(d => d.fecha === m.fecha);
    if (!dia) continue;
    dia.turnos.push(m.entrada + " a " + (m.salida || "…"));
    dia.horas += duracion(m.entrada, m.salida);
  }
  return { nombre: p.nombre, dias, total: dias.reduce((a, d) => a + d.horas, 0) };
}

function nuevoPin(p) { return p.nuevo ? " Tu PIN quedó guardado: " + p.pin + ". Anotalo, lo vas a usar siempre." : ""; }

/* ---------------- adelantos y precios ---------------- */

/** Adelantos de la última semana de la persona, solo si en CONFIG "Mostrar adelantos" dice SÍ. */
function misAdelantos(nombre, pin) {
  const p = validar(nombre, pin);
  const ver = String(libro().getSheetByName("CONFIG").getRange("B5").getDisplayValue()).trim().toUpperCase();
  if (ver !== "SÍ" && ver !== "SI") return { visible: false };
  const buscada = PESTANAS[p.nombre] || p.nombre.toLowerCase();
  const ss = SpreadsheetApp.openById(ADELANTOS_ID);
  const hoja = ss.getSheets().find(h => h.getName().trim().toLowerCase() === buscada);
  if (!hoja) return { visible: true, error: "No encuentro tu pestaña en la planilla de adelantos." };
  // Solo las últimas 120 filas: la semana actual siempre está al final y leer toda la pestaña tarda.
  const ultima = hoja.getLastRow(), desdeFila = Math.max(1, ultima - 119);
  const rango = hoja.getRange(desdeFila, 1, ultima - desdeFila + 1, 4);
  const v = rango.getValues(), d = rango.getDisplayValues();
  let ini = -1;
  for (let i = 0; i < v.length; i++) if (/^semana del/i.test(String(d[i][0]).trim() || String(d[i][1]).trim())) ini = i;
  if (ini < 0) return { visible: true, error: "Todavía no hay una semana cargada." };
  const t = (String(d[ini][0]).trim() || String(d[ini][1]).trim()).toLowerCase().replace(/\s+/g, " ");
  const semana = t.charAt(0).toUpperCase() + t.slice(1);
  const efectivo = [], consumos = [], aFavor = [];
  for (let i = ini + 1; i < v.length; i++) {
    const concepto = String(d[i][1]).trim();
    if (!concepto || /^semana del/i.test(concepto) || /devoluci|devuelve/i.test(concepto)) continue;
    const fecha = String(d[i][0]).trim().slice(0, 5), debe = num(v[i][2]), haber = num(v[i][3]);
    if (debe) (/adelanto|efectivo/i.test(concepto) ? efectivo : consumos).push({ fecha, concepto, monto: debe });
    else if (haber) aFavor.push({ fecha, concepto, monto: haber });
  }
  const total = [...efectivo, ...consumos].reduce((a, x) => a + x.monto, 0) - aFavor.reduce((a, x) => a + x.monto, 0);
  return { visible: true, semana, efectivo, consumos, aFavor, total, listas: LISTAS_PDF };
}

function num(x) {
  if (typeof x === "number") return x;
  const s = String(x).replace(/[^\d,.-]/g, "");
  if (!s || s === "-") return 0;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) || 0;
}

/** Listas de precios para socios (mercadería al costo y platos con el 25%). Se guarda 30 minutos. */
function precios() {
  const cache = CacheService.getScriptCache(), guardado = cache.get("precios");
  if (guardado) return JSON.parse(guardado);
  const ss = SpreadsheetApp.openById(PRECIOS_ID);
  const leer = nombre => {
    const sh = ss.getSheetByName(nombre), d = sh.getDataRange().getDisplayValues();
    return { nota: String(d[1] && d[1][0] || ""), filas: d.slice(4).filter(r => r[1] && r[2]).map(r => [r[0], r[1], r[2]]) };
  };
  const out = { mercaderia: leer("Mercadería"), platos: leer("Platos"), listas: LISTAS_PDF };
  try { cache.put("precios", JSON.stringify(out), 1800); } catch (e) {}
  return out;
}

/* ---------------- ubicación ---------------- */

/** Compara la posición del celular con la del club (hoja CONFIG). Nunca bloquea la marca. */
function donde(pos) {
  if (!pos || pos.lat == null) return { texto: "sin dato", coord: "", aviso: "" };
  const c = libro().getSheetByName("CONFIG").getRange("B2:B4").getValues().map(r => Number(r[0]));
  const [lat, lon, radio] = c;
  const m = metros(lat, lon, pos.lat, pos.lon);
  const dist = m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(1).replace(".", ",") + " km";
  const adentro = m <= radio + Math.min(pos.acc || 0, 50);
  return { texto: (adentro ? "SÍ" : "NO") + " (" + dist + ")", coord: pos.lat.toFixed(6) + ", " + pos.lon.toFixed(6),
    aviso: adentro ? "" : " Ojo: no parece que estés en el club (" + dist + "). La marca quedó guardada para que Matías la revise." };
}

function metros(a1, o1, a2, o2) {
  const r = Math.PI / 180, x = Math.sin((a2 - a1) * r / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin((o2 - o1) * r / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(x));
}

/* ---------------- datos ---------------- */

function libro() { return SpreadsheetApp.getActiveSpreadsheet(); }

function leerPersonal() {
  const v = libro().getSheetByName("PERSONAL").getDataRange().getDisplayValues().slice(1);
  return v.map((r, i) => ({ fila: i + 2, nombre: r[0].trim(), pin: String(r[1]).trim(), activo: r[3].trim().toUpperCase() !== "NO",
    cel: String(r[4] || "").replace(/\D/g, "") }))
    .filter(p => p.nombre);
}

function leerMarcas() {
  const v = libro().getSheetByName("MARCAS").getDataRange().getDisplayValues();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    if (!v[i][1]) continue;
    out.push({ fila: i + 1, fecha: v[i][0], nombre: v[i][1], entrada: v[i][2], salida: v[i][3] });
  }
  return out;
}

/** Revisa el PIN. Si la persona todavía no tiene, el que pone la primera vez queda como su PIN. */
function validar(nombre, pin) {
  const p = leerPersonal().find(x => x.nombre === nombre && x.activo);
  if (!p) throw new Error("No encuentro a " + nombre + " en la lista.");
  pin = String(pin).trim();
  if (!/^\d{4}$/.test(pin)) throw new Error("El PIN tiene que ser de 4 números.");
  if (!p.pin) {
    libro().getSheetByName("PERSONAL").getRange(p.fila, 2).setValue("'" + pin);
    p.pin = pin; p.nuevo = true;
  }
  if (p.pin !== pin) throw new Error("PIN incorrecto.");
  return p;
}

function fecha(d) { return Utilities.formatDate(d, ZONA, "yyyy-MM-dd"); }
function hora(d) { return Utilities.formatDate(d, ZONA, "HH:mm"); }
function sabado(d) {
  const dow = Number(Utilities.formatDate(d, ZONA, "u")); // 1 = lunes … 7 = domingo
  return new Date(d.getTime() - ((dow + 1) % 7) * 86400000);
}
function duracion(a, b) {
  if (!a || !b) return 0;
  const m = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  let x = m(b) - m(a);
  if (x < 0) x += 1440;
  return x / 60;
}

/* ---------------- aviso diario por mail ---------------- */

/** Correr una sola vez (Ejecutar → activarAvisos): manda avisoDiario todos los días entre las 9 y las 10. */
function activarAvisos() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "avisoDiario").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("avisoDiario").timeBased().everyDays(1).atHour(9).inTimezone(ZONA).create();
  avisoDiario(true);
}

/** Mail a Matías con olvidos de salida y marcas de afuera del club, con botones de WhatsApp para avisar a cada socio. */
function avisoDiario(prueba) {
  const personal = {};
  leerPersonal().forEach(p => personal[p.nombre] = p);
  const v = libro().getSheetByName("MARCAS").getDataRange().getDisplayValues();
  const ayer = fecha(new Date(Date.now() - 86400000)), ahora = Date.now();
  const olvidos = [], afuera = [], cargadas = [];
  for (let i = 1; i < v.length; i++) {
    const [f, nombre, entrada, salida, , origen, , lugarIn, lugarOut] = v[i];
    if (!nombre) continue;
    const inicio = new Date(f + "T" + entrada + ":00-03:00").getTime();
    if (!salida && ahora - inicio > 14 * 3600000) olvidos.push({ nombre, f, entrada });
    if (f === ayer && (/^NO/.test(lugarIn) || /^NO/.test(lugarOut))) afuera.push({ nombre, f, entrada, salida, lugar: /^NO/.test(lugarIn) ? lugarIn : lugarOut });
    if (/^olvido/.test(origen) && origen.indexOf(Utilities.formatDate(new Date(Date.now() - 86400000), ZONA, "dd/MM")) >= 0) cargadas.push({ nombre, f, entrada, salida });
  }
  if (!olvidos.length && !afuera.length && !cargadas.length && !prueba) return;
  const dia = f => f.slice(8) + "/" + f.slice(5, 7);
  const wa = (nombre, texto) => {
    const c = (personal[nombre] || {}).cel;
    return c ? ' <a href="https://wa.me/549' + c + '?text=' + encodeURIComponent(texto) + '" style="background:#25d366;color:#fff;padding:4px 10px;border-radius:6px;text-decoration:none">Avisar por WhatsApp</a>'
             : ' <span style="color:#888">(sin celular cargado)</span>';
  };
  let html = "<div style='font-family:Arial,sans-serif;font-size:15px'><h2 style='font-weight:normal'>La Caleta · Horarios</h2>";
  if (olvidos.length) {
    html += "<h3>Se olvidaron de marcar la salida</h3><ul>";
    olvidos.forEach(o => html += "<li style='margin:8px 0'><b>" + o.nombre + "</b>: entró el " + dia(o.f) + " a las " + o.entrada + "." +
      wa(o.nombre, "Hola " + o.nombre + " 👋 el " + dia(o.f) + " te olvidaste de marcar la salida en la app de La Caleta. Entrá a lacaleta.ycr.com.ar/app, tocá tu nombre y cargá a qué hora saliste 🙏") + "</li>");
    html += "</ul>";
  }
  if (cargadas.length) {
    html += "<h3>Salidas olvidadas que cargaron ellos (revisar)</h3><ul>";
    cargadas.forEach(o => html += "<li><b>" + o.nombre + "</b>: " + dia(o.f) + " de " + o.entrada + " a " + o.salida + "</li>");
    html += "</ul>";
  }
  if (afuera.length) {
    html += "<h3>Marcaron desde afuera del club (ayer)</h3><ul>";
    afuera.forEach(o => html += "<li><b>" + o.nombre + "</b>: " + o.entrada + " a " + (o.salida || "…") + " · " + o.lugar + "</li>");
    html += "</ul>";
  }
  if (!olvidos.length && !afuera.length && !cargadas.length) html += "<p>Prueba: los avisos quedaron activados. Todos los días a las 9 te llega este mail si hay algo para revisar.</p>";
  html += "<p style='color:#888;font-size:13px'>Planilla: " + libro().getUrl() + "</p></div>";
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), (prueba ? "Prueba · " : "") + "La Caleta · avisos de horarios", "Abrí este mail en un programa que muestre HTML.", { htmlBody: html, name: "La Caleta" });
}

/* ---------------- liquidación ---------------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("La Caleta")
    .addItem("Armar mensajes de cobro", "armarMensajes")
    .addItem("Guardar liquidación de la semana", "guardarLiquidacion")
    .addToUi();
}

function plata(n) {
  const s = Math.abs(n).toFixed(2).split(".");
  return (n < 0 ? "-$" : "$") + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1];
}
function horasTxt(h) { return (Math.round(h * 100) / 100).toString().replace(".", ",") + " hs"; }

/** Escribe en la columna Mensaje el texto para WhatsApp de cada uno que trabajó. */
function armarMensajes() {
  const sh = libro().getSheetByName("SEMANA");
  const inicio = sh.getRange("C1").getValue();
  const fin = new Date(inicio.getTime() + 6 * 86400000);
  const periodo = Utilities.formatDate(inicio, ZONA, "dd") + " al " + Utilities.formatDate(fin, ZONA, "dd/MM");
  const v = sh.getRange(4, 1, 40, 19).getValues();
  const out = v.map(r => {
    const [nombre, , , , , , , , , hs, pago, propina, extra, detalle, prestamo, adelantos, total, efectivo, transf] = r;
    if (!nombre || !(hs > 0 || extra || prestamo || adelantos)) return [""];
    const l = ["*" + String(nombre).toUpperCase() + "*", "Horas trabajadas: " + horasTxt(hs || 0),
      "Hs " + periodo + ": " + plata(pago || 0)];
    if (propina) l.push("Propina: " + plata(propina));
    if (extra) l.push((detalle ? "Extra " + detalle : "Extra") + ": " + plata(extra));
    if (prestamo) l.push("Cuota préstamo: " + plata(-prestamo));
    if (adelantos) l.push("Adelantos: " + plata(-adelantos));
    l.push("*TOTAL: " + plata(total || 0) + "*");
    if (efectivo) l.push("Efectivo: " + plata(efectivo));
    if (transf) l.push("Transferencia: " + plata(transf));
    return [l.join("\n")];
  });
  sh.getRange(4, 20, 40, 1).setValues(out).setWrap(true).setVerticalAlignment("top");
}

/** Copia la semana (valores, no fórmulas) a una hoja "Liq dd-mm" y limpia lo cargado a mano. */
function guardarLiquidacion() {
  armarMensajes();
  const ss = libro(), sh = ss.getSheetByName("SEMANA");
  const nombre = "Liq " + Utilities.formatDate(sh.getRange("C1").getValue(), ZONA, "dd-MM-yyyy");
  if (ss.getSheetByName(nombre)) { SpreadsheetApp.getUi().alert("Ya existe la hoja " + nombre + ". Borrala si querés guardarla de nuevo."); return; }
  const copia = sh.copyTo(ss).setName(nombre);
  const rango = copia.getDataRange();
  rango.setValues(rango.getValues());
  copia.getRange("C1").setValue(sh.getRange("C1").getValue());
  sh.getRange("M4:P43").clearContent();
  sh.getRange("R4:R43").clearContent();
  sh.getRange("T4:T43").clearContent();
  sh.getRange("R1").setValue(0);
  SpreadsheetApp.getUi().alert("Guardado en la hoja " + nombre + ".");
}

/* ---------------- instalación ---------------- */

/** Arma las hojas. Correr una sola vez desde el editor (Ejecutar → instalar). */
function instalar() {
  const ss = libro();
  ss.setSpreadsheetTimeZone(ZONA);
  const hoja = (nombre) => ss.getSheetByName(nombre) || ss.insertSheet(nombre);

  const per = hoja("PERSONAL");
  if (per.getLastRow() < 2) {
    per.getRange(1, 1, 1, 5).setValues([["Nombre", "PIN", "Valor hora", "Activo", "Celular"]]);
    per.getRange(2, 1, PERSONAL_INICIAL.length, 4).setValues(PERSONAL_INICIAL.map(([n, v]) => [n, "", v, "SÍ"]));
    per.getRange("F1").setValue("Valores de la hora: básica + antigüedad 09/26. Para dar de baja a alguien, poné NO en Activo. PIN vacío = la persona lo elige la primera vez que usa la app; para que elija uno nuevo, borrá su PIN.");
  }

  const mar = hoja("MARCAS");
  mar.getRange(1, 1, 1, 11).setValues([["Fecha", "Nombre", "Entrada", "Salida", "Horas", "Origen", "Marcado",
    "En el club al entrar", "En el club al salir", "Ubicación entrada", "Ubicación salida"]]);
  mar.getRange("M1").setValue("Para corregir: cambiá Entrada o Salida (HH:MM) y poné 'a mano' en Origen. Para cargar un turno olvidado, copiá una fila y cambiala.");
  const rojo = SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith("NO").setBackground("#f4c7c3")
    .setRanges([mar.getRange("H2:I")]).build();
  mar.setConditionalFormatRules([rojo]);

  const cfg = hoja("CONFIG");
  if (cfg.getLastRow() < 1) {
    cfg.getRange(1, 1, 5, 2).setValues([["Dato", "Valor"], ["Latitud del club", -32.900235], ["Longitud del club", -60.681259], ["Radio en metros", 150], ["Mostrar adelantos (SÍ/NO)", "NO"]]);
    cfg.getRange("D1").setValue("Ubicación tomada por Matías desde adentro del restaurante (08/11/2026), Av. Carlos Colombres 1296. Para cambiarla, poner acá otra latitud y longitud.");
  }

  const fer = hoja("FERIADOS");
  if (fer.getLastRow() < 1) {
    fer.getRange(1, 1, 1, 3).setValues([["Fecha", "Motivo", "Multiplica la hora por"]]);
    fer.getRange("A:A").setNumberFormat("@");
    fer.getRange(2, 1, 3, 3).setValues([
      ["2026-12-08", "Inmaculada Concepción", ""],
      ["2026-12-25", "Navidad", ""],
      ["2027-01-01", "Año Nuevo", ""],
    ]);
    fer.getRange("E1").setValue("Fechas como AAAA-MM-DD. Falta que la tesorera confirme cuánto se paga la hora en feriado (ej. 2 = doble). Vacío = hora normal.");
  }

  armarSemana(hoja("SEMANA"));
  ["SEMANA", "PERSONAL", "MARCAS", "FERIADOS", "CONFIG"].forEach((n, i) => { ss.setActiveSheet(ss.getSheetByName(n)); ss.moveActiveSheet(i + 1); });
  const sobra = ss.getSheetByName("Hoja 1") || ss.getSheetByName("Sheet1");
  if (sobra && sobra.getLastRow() === 0) ss.deleteSheet(sobra);
}

function armarSemana(sh) {
  sh.clear();
  sh.getRange("A1").setValue("Semana que empieza el sábado:");
  sh.getRange("C1").setFormula("=TODAY()-MOD(WEEKDAY(TODAY()),7)").setNumberFormat("dd/mm/yyyy").setBackground("#fff2cc");
  sh.getRange("E1").setValue("Cambiá la fecha amarilla (un sábado) para ver otra semana.");
  sh.getRange("A2").setValue("Multiplicador feriado →");
  sh.getRange("A3:B3").setValues([["Nombre", "Valor hora"]]);
  const dias = ["Sáb", "Dom", "Lun", "Mar", "Mié", "Jue", "Vie"];
  for (let i = 0; i < 7; i++) {
    const col = 3 + i;
    sh.getRange(3, col).setFormula('=TEXT($C$1+' + i + ',"ddd dd/mm")');
    sh.getRange(2, col).setFormula('=IFERROR(IF(VLOOKUP(TEXT($C$1+' + i + ',"yyyy-mm-dd"),FERIADOS!$A:$C,3,FALSE)="",1,VLOOKUP(TEXT($C$1+' + i + ',"yyyy-mm-dd"),FERIADOS!$A:$C,3,FALSE)),1)');
    for (let f = 4; f < 4 + 40; f++) {
      sh.getRange(f, col).setFormula('=IF($A' + f + '="","",SUMIFS(MARCAS!$E:$E,MARCAS!$B:$B,$A' + f + ',MARCAS!$A:$A,TEXT($C$1+' + i + ',"yyyy-mm-dd")))');
    }
  }
  sh.getRange("J3:T3").setValues([["HS", "Pago horas", "Propina", "Extra", "Detalle del extra", "Cuota préstamo",
    "Adelantos", "TOTAL", "Efectivo", "Transferencia", "Mensaje"]]);
  sh.getRange("O1").setValue("Propina de la semana a repartir:");
  sh.getRange("R1").setValue(0).setBackground("#fff2cc").setNumberFormat("$ #,##0.00");
  sh.getRange("O2").setValue("Amarillo = se carga a mano. La propina se reparte proporcional a las horas.");
  for (let f = 4; f < 4 + 40; f++) {
    sh.getRange(f, 1).setFormula('=IFERROR(INDEX(FILTER(PERSONAL!$A$2:$A,PERSONAL!$D$2:$D<>"NO",PERSONAL!$A$2:$A<>""),' + (f - 3) + '),"")');
    sh.getRange(f, 2).setFormula('=IF($A' + f + '="","",IFERROR(VLOOKUP($A' + f + ',PERSONAL!$A:$C,3,FALSE),""))');
    sh.getRange(f, 10).setFormula('=IF($A' + f + '="","",SUM(C' + f + ':I' + f + '))');
    sh.getRange(f, 11).setFormula('=IF($A' + f + '="","",ROUND(SUMPRODUCT(C' + f + ':I' + f + ',$C$2:$I$2)*B' + f + ',2))');
    sh.getRange(f, 12).setFormula('=IF($A' + f + '="","",IF(SUM($J$4:$J$43)=0,0,ROUND($R$1*J' + f + '/SUM($J$4:$J$43),2)))');
    sh.getRange(f, 17).setFormula('=IF($A' + f + '="","",K' + f + '+L' + f + '+N(M' + f + ')-N(O' + f + ')-N(P' + f + '))');
    sh.getRange(f, 19).setFormula('=IF($A' + f + '="","",Q' + f + '-N(R' + f + '))');
  }
  sh.getRange("M4:P43").setBackground("#fff2cc");
  sh.getRange("R4:R43").setBackground("#fff2cc");
  sh.getRange("A44").setValue("TOTAL");
  ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "O", "P", "Q", "R", "S"].forEach(c => sh.getRange(c + "44").setFormula("=SUM(" + c + "4:" + c + "43)"));
  sh.getRange("C4:J44").setNumberFormat("0.00");
  sh.getRange("B4:B43").setNumberFormat("$ #,##0");
  sh.getRange("K4:M44").setNumberFormat("$ #,##0.00");
  sh.getRange("O4:S44").setNumberFormat("$ #,##0.00");
  sh.getRange("A3:T3").setFontWeight("bold").setBackground("#1d3a66").setFontColor("#ffffff");
  sh.getRange("A44:T44").setFontWeight("bold");
  sh.setColumnWidth(20, 320);
  sh.setFrozenRows(3);
  sh.setFrozenColumns(1);
}

/* ---------------- pantalla (copia de Index.html) ---------------- */

const PANTALLA = `<!DOCTYPE html>
<html lang="es">
<head>
<base target="_top">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>La Caleta</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&family=Figtree:wght@400;500;600;700&display=swap">
<style>
  :root {
    --paper: #f6f4ef; --card: #ffffff; --ink: #161616; --muted: #6b6760; --line: #e3dfd6;
    --in: #2f6b4f; --in-bg: #e7f0ea; --out: #9b3b2e; --warn: #a8661b; --warn-bg: #fbf1e3; --info: #2c4a73; --info-ink: #ffffff;
    --f-display: "Marcellus", "Optima", "Candara", Georgia, serif;
    --f-body: "Figtree", -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  }
  @media (prefers-color-scheme: dark) { :root {
    --paper: #121211; --card: #1c1c1a; --ink: #f2efe8; --muted: #a39f96; --line: #2e2d2a;
    --in: #7cc59f; --in-bg: #1b2b22; --out: #ec8f80; --warn: #e6a659; --warn-bg: #2c2216; --info: #9dbbe3; --info-ink: #121211; color-scheme: dark; }
    .logo { filter: invert(1); } }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.45 var(--f-body); }
  .wrap { max-width: 560px; margin: 0 auto; padding: 18px 16px 48px; display: grid; gap: 20px; }
  .vista { display: grid; gap: 20px; }
  header { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px; }
  .logo { width: 54px; height: auto; }
  .brand { font: 24px/1.1 var(--f-display); letter-spacing: .12em; }
  .brand small { display: block; font: 600 11px var(--f-body); letter-spacing: .14em; color: var(--muted); text-transform: uppercase; margin-top: 4px; }
  .clock { font: 30px var(--f-display); font-variant-numeric: tabular-nums; }
  nav { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 4px; }
  nav button { font: 600 15px var(--f-body); padding: 10px; border: 0; border-radius: 10px; background: transparent; color: var(--muted); cursor: pointer; }
  nav button.on { background: var(--ink); color: var(--paper); }
  h2 { margin: 0; font: 600 12px var(--f-body); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  section { display: grid; gap: 10px; }
  .list { display: grid; gap: 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .person { display: grid; grid-template-columns: 40px 1fr; align-items: center; gap: 10px; text-align: left; width: 100%;
    font: inherit; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; cursor: pointer; min-height: 62px; }
  .person b { font-weight: 600; display: block; }
  .person small { color: var(--muted); font-size: 13px; }
  .av { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font: 17px var(--f-display); background: var(--paper); border: 1px solid var(--line); }
  .person.inside { border-color: var(--in); }
  .person.inside .av { background: var(--in); color: var(--card); border-color: var(--in); }
  .person.inside small { color: var(--in); font-weight: 600; }
  .person.olvido { border-color: var(--warn); background: var(--warn-bg); }
  .person.olvido small { color: var(--warn); font-weight: 600; }
  :focus-visible { outline: 3px solid var(--warn); outline-offset: 2px; }
  .empty, .hint { margin: 0; color: var(--muted); font-size: 15px; }
  .sheet { position: fixed; inset: 0; background: rgba(10,10,10,.45); display: grid; place-items: end center; z-index: 5; }
  .box { background: var(--card); width: min(520px, 100%); max-height: 94vh; overflow: auto; border-radius: 22px 22px 0 0; display: grid; gap: 14px; padding: 22px 18px 26px; }
  @media (min-width: 640px) { .sheet { place-items: center; } .box { border-radius: 22px; } }
  .box h3 { margin: 0; font: 26px var(--f-display); }
  .pin { display: flex; justify-content: center; gap: 12px; }
  .pin span { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--ink); }
  .pin span.on { background: var(--ink); }
  .pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .pad button { font: 24px var(--f-display); padding: 12px 0; border-radius: 14px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; }
  .big { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .big button, .solo { font: 700 19px var(--f-body); padding: 18px 10px; border: 0; border-radius: 16px; cursor: pointer; color: #fff; }
  .b-in { background: var(--in); } .b-out { background: var(--out); }
  .big button:disabled, .solo:disabled, .ghost:disabled { opacity: .3; cursor: default; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .consultas { display: grid; gap: 8px; margin-top: 10px; padding-top: 14px; border-top: 1px dashed var(--line); }
  .consultas .two button { font: 600 15px var(--f-body); padding: 14px 8px; border: 0; border-radius: 14px; background: var(--info); color: var(--info-ink); cursor: pointer; }
  .consultas .two button:disabled { opacity: .4; }
  .ghost { font: 600 14px var(--f-body); padding: 12px 8px; border-radius: 14px; border: 1px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
  .close { font: 600 15px var(--f-body); background: none; border: 0; color: var(--muted); cursor: pointer; padding: 6px; }
  .msg { padding: 12px; border-radius: 12px; background: var(--in-bg); font-weight: 600; }
  .msg.err { background: var(--warn-bg); color: var(--ink); border: 1px solid var(--warn); }
  .warn { padding: 12px; border-radius: 12px; border: 1px solid var(--warn); background: var(--warn-bg); margin: 0; }
  input[type=time], input[type=search], input[type=tel] { font: 500 18px var(--f-body); padding: 12px; border: 1px solid var(--line); border-radius: 12px; width: 100%; background: var(--paper); color: var(--ink); }
  .ok { display: grid; justify-items: center; gap: 10px; padding: 18px 0 6px; text-align: center; }
  .ok .tick { width: 84px; height: 84px; border-radius: 50%; background: var(--in); color: #fff; display: grid; place-items: center; font-size: 46px; }
  .ok p { margin: 0; font: 21px var(--f-display); }
  .ok small { color: var(--muted); font-size: 14px; }
  @media (prefers-reduced-motion: no-preference) { .ok .tick { animation: pop .35s ease-out; } @keyframes pop { from { transform: scale(.4); opacity: 0; } } }
  .panel { display: grid; gap: 10px; border-top: 1px solid var(--line); padding-top: 14px; }
  .panel h4 { margin: 0; font: 600 12px var(--f-body); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 15px; }
  td { padding: 6px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  td.f { color: var(--muted); width: 50px; }
  td.m { text-align: right; white-space: nowrap; padding-left: 8px; }
  tr.tot td { font-weight: 700; border-bottom: 0; }
  .total { display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid var(--ink); padding-top: 10px; }
  .total b { font: 24px var(--f-display); }
  a { color: var(--ink); }
  .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .seg button { font: 600 14px var(--f-body); padding: 9px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--muted); cursor: pointer; }
  .seg button.on { border-color: var(--ink); color: var(--ink); }
  .rubro { margin: 8px 0 0; font: 600 12px var(--f-body); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .precio { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .precio span:last-child { white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <img class="logo" alt="La Caleta" src="data:image/png;base64,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">
    <div class="brand">LA CALETA<small id="saludo">Cooperativa gastronómica</small></div>
    <div class="clock" id="clock">--:--</div>
  </header>

  <nav>
    <button type="button" id="tabMarcar" class="on">Horarios</button>
    <button type="button" id="tabPrecios">Precios</button>
  </nav>

  <div id="vistaMarcar" class="vista">
    <p class="hint" id="hint">Cargando…</p>
    <section>
      <h2>Trabajando ahora</h2>
      <div class="list" id="adentro"></div>
    </section>
    <section>
      <h2>Tocá tu nombre</h2>
      <div class="grid" id="todos"></div>
    </section>
  </div>

  <div id="vistaPrecios" class="vista" hidden>
    <div class="seg">
      <button type="button" id="segMerc" class="on">Mercadería</button>
      <button type="button" id="segPlatos">Platos</button>
    </div>
    <input type="search" id="buscar" placeholder="Buscar: pechuga, yerba, milanesa…" autocomplete="off">
    <p class="hint" id="notaPrecios">Cargando precios…</p>
    <div id="listaPrecios"></div>
    <p class="hint">Listas completas en PDF (productos y recetas): <a id="linkPdf" href="#" target="_blank" rel="noopener">abrir carpeta</a></p>
  </div>
</div>
<div class="sheet" id="sheet" hidden><div class="box" id="box" role="dialog" aria-modal="true"></div></div>

<script>
var DIAS = ["Sáb", "Dom", "Lun", "Mar", "Mié", "Jue", "Vie"];
var estado = { personas: [], abiertos: {}, sinPin: [], sinCel: [] };
var PRECIOS = null, vistaPrecio = "mercaderia";
function $(id) { return document.getElementById(id); }
function pad2(n) { return String(n).padStart(2, "0"); }
function hhmm(d) { return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
function el(t, p) { var e = document.createElement(t); Object.assign(e, p || {}); for (var i = 2; i < arguments.length; i++) e.append(arguments[i]); return e; }
function iniciales(n) { return n.split(" ").map(function (p) { return p.charAt(0); }).join("").slice(0, 2).toUpperCase(); }
function plata(n) { return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function horasTxt(h) { var m = Math.round(h * 60); return Math.floor(m / 60) + ":" + pad2(m % 60); }
function desde(a) { var f = a.fecha.split("-").map(Number), h = a.entrada.split(":").map(Number); return new Date(f[0], f[1] - 1, f[2], h[0], h[1]); }
function olvidada(a) { return !!a && Date.now() - desde(a).getTime() > 14 * 3600000; }
function lleva(a) { var m = Math.max(0, Math.floor((Date.now() - desde(a).getTime()) / 60000)); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min"; }
function diaTxt(f) { var d = new Date(f + "T12:00:00"); return ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][d.getDay()] + " " + f.slice(8) + "/" + f.slice(5, 7); }
function vibrar() { try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {} }

function tick() {
  var d = new Date(), h = d.getHours();
  $("clock").textContent = hhmm(d);
  $("saludo").textContent = h < 6 ? "Buenas noches" : h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
}
tick(); setInterval(tick, 15000);

/* ---------- pestañas ---------- */
function mostrarVista(cual) {
  $("tabMarcar").className = cual === "marcar" ? "on" : "";
  $("tabPrecios").className = cual === "precios" ? "on" : "";
  $("vistaMarcar").hidden = cual !== "marcar";
  $("vistaPrecios").hidden = cual !== "precios";
  if (cual === "precios" && !PRECIOS) cargarPrecios();
}
$("tabMarcar").onclick = function () { mostrarVista("marcar"); };
$("tabPrecios").onclick = function () { mostrarVista("precios"); };

/* ---------- horarios ---------- */
function cargar() {
  google.script.run.withSuccessHandler(function (e) { estado = e; dibujar(); })
    .withFailureHandler(function (err) { $("hint").hidden = false; $("hint").textContent = "No se pudo cargar: " + err.message; }).estado();
}
function tarjeta(n) {
  var a = estado.abiertos[n], olv = olvidada(a);
  var b = el("button", { type: "button", className: "person" + (olv ? " olvido" : a ? " inside" : "") },
    el("span", { className: "av", textContent: iniciales(n) }),
    el("span", {}, el("b", { textContent: n }), el("small", { textContent: olv ? "⚠ Falta marcar la salida" : a ? "Adentro hace " + lleva(a) : "Afuera" })));
  b.onclick = function () { abrir(n); };
  return b;
}
function dibujar() {
  $("hint").hidden = true;
  var ad = $("adentro"), to = $("todos"); ad.textContent = ""; to.textContent = "";
  var dentro = estado.personas.filter(function (n) { return estado.abiertos[n]; })
    .sort(function (x, y) { return desde(estado.abiertos[x]) - desde(estado.abiertos[y]); });
  if (!dentro.length) ad.append(el("p", { className: "empty", textContent: "Nadie marcó entrada todavía." }));
  dentro.forEach(function (n) { ad.append(tarjeta(n)); });
  estado.personas.filter(function (n) { return !estado.abiertos[n]; }).forEach(function (n) { to.append(tarjeta(n)); });
}
function cerrar() { $("sheet").hidden = true; $("box").textContent = ""; cargar(); }
$("sheet").addEventListener("click", function (e) { if (e.target.id === "sheet") cerrar(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrar(); });

function exito(texto, detalle) {
  vibrar();
  var box = $("box"); box.textContent = "";
  box.append(el("div", { className: "ok" }, el("div", { className: "tick", textContent: "✓" }), el("p", { textContent: texto }), detalle ? el("small", { textContent: detalle }) : ""));
  setTimeout(cerrar, detalle ? 6000 : 2200);
}

function abrir(n) {
  var a = estado.abiertos[n], olv = olvidada(a), nuevo = (estado.sinPin || []).indexOf(n) >= 0;
  var box = $("box"); box.textContent = "";
  var pin = "";
  var dots = el("div", { className: "pin" }, el("span"), el("span"), el("span"), el("span"));
  function pintar() { Array.prototype.forEach.call(dots.children, function (s, i) { s.className = i < pin.length ? "on" : ""; }); }
  var teclas = el("div", { className: "pad" });
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].forEach(function (k) {
    var b = el("button", { type: "button", textContent: k, disabled: !k });
    if (!k) b.style.visibility = "hidden";
    b.onclick = function () { if (k === "←") pin = pin.slice(0, -1); else if (pin.length < 4) pin += k; pintar(); };
    teclas.append(b);
  });
  var msg = el("div", { className: "msg", hidden: true });
  var zona = el("div");
  function mostrar(t, err) { msg.textContent = t; msg.className = "msg" + (err ? " err" : ""); msg.hidden = false; }
  function pinOk() { if (pin.length !== 4) { mostrar("Poné tus 4 números.", true); return false; } return true; }
  var hint = el("p", { className: "hint", textContent: nuevo
    ? "Primera vez: elegí 4 números que te acuerdes. Ese va a ser tu PIN."
    : a ? "Entraste a las " + a.entrada + ". Poné tu PIN y tocá Salí." : "Poné tu PIN y tocá Entré." });

  var acciones;
  if (olv) {
    var hora = el("input", { type: "time", id: "horaOlvido" });
    var guardar = el("button", { type: "button", className: "solo b-out", textContent: "Guardar salida" });
    guardar.onclick = function () {
      if (!pinOk()) return;
      if (!hora.value) { mostrar("Poné la hora en que saliste.", true); return; }
      guardar.disabled = true;
      google.script.run.withSuccessHandler(function (r) { if (r.ok) exito("Salida guardada a las " + hora.value, "Matías la va a revisar."); else { mostrar(r.texto, true); guardar.disabled = false; } })
        .withFailureHandler(function (err) { mostrar(err.message, true); guardar.disabled = false; }).marcar(n, pin, "olvido", null, hora.value);
    };
    hint = el("p", { className: "warn", textContent: "Te olvidaste de marcar la salida del " + diaTxt(a.fecha) + " (entraste a las " + a.entrada + "). Poné tu PIN y la hora en que saliste." });
    acciones = el("div", { style: "display:grid;gap:10px" }, el("label", { className: "hint", htmlFor: "horaOlvido", textContent: "Hora de salida" }), hora, guardar);
  } else {
    var pideCel = (estado.sinCel || []).indexOf(n) >= 0;
    var cel = el("input", { type: "tel", id: "cel", placeholder: "Ej: 341 5123456", inputMode: "numeric", autocomplete: "tel" });
    var bin = el("button", { type: "button", className: "b-in", textContent: "Entré", disabled: !!a });
    var bout = el("button", { type: "button", className: "b-out", textContent: "Salí", disabled: !a });
    var enviar = function (tipo, btn) {
      if (!pinOk()) return;
      var numero = cel.value.replace(/[^0-9]/g, "");
      if (pideCel && numero.length !== 10) { mostrar("Poné tu celular: código de área sin 0 y el número sin 15 (10 números en total, ej. 341 5123456).", true); return; }
      btn.disabled = true; mostrar("Guardando… (buscando tu ubicación)", false);
      ubicacion(function (pos) {
        google.script.run.withSuccessHandler(function (r) {
          if (!r.ok) { mostrar(r.texto, true); btn.disabled = false; return; }
          var partes = r.texto.split(". ");
          exito(partes[0].replace("¡Listo " + n + "! ", ""), partes.slice(1).join(". "));
        }).withFailureHandler(function (err) { mostrar(err.message, true); btn.disabled = false; }).marcar(n, pin, tipo, pos, null, pideCel ? numero : "");
      });
    };
    bin.onclick = function () { enviar("in", bin); };
    bout.onclick = function () { enviar("out", bout); };
    acciones = el("div", { className: "big" }, bin, bout);
    if (pideCel) acciones = el("div", { style: "display:grid;gap:10px" },
      el("label", { className: "hint", htmlFor: "cel", textContent: "Tu celular (una sola vez), para avisarte por WhatsApp si te olvidás de marcar:" }), cel, acciones);
  }

  var verHoras = el("button", { type: "button", textContent: "🕒 Mis horas" });
  var verAdel = el("button", { type: "button", textContent: "💵 Mis adelantos" });
  verHoras.onclick = function () {
    if (!pinOk()) return;
    verHoras.disabled = true;
    zona.textContent = ""; zona.append(el("div", { className: "panel" }, el("p", { className: "hint", textContent: "Buscando tus horas…" })));
    google.script.run.withSuccessHandler(function (r) {
      verHoras.disabled = false; msg.hidden = true;
      var t = el("table");
      r.dias.forEach(function (d, i) {
        var tr = t.insertRow();
        tr.append(el("td", { className: "f", textContent: DIAS[i] + " " + d.fecha.slice(8) }), el("td", { textContent: d.turnos.join(", ") || "—" }), el("td", { className: "m", textContent: d.horas ? horasTxt(d.horas) : "" }));
      });
      var tr = t.insertRow(); tr.className = "tot";
      tr.append(el("td"), el("td", { textContent: "Total de la semana" }), el("td", { className: "m", textContent: horasTxt(r.total) }));
      zona.textContent = ""; zona.append(el("div", { className: "panel" }, el("h4", { textContent: "Mis horas · semana de sábado a viernes" }), t));
    }).withFailureHandler(function (err) { verHoras.disabled = false; mostrar(err.message, true); }).misHoras(n, pin);
  };
  verAdel.onclick = function () {
    if (!pinOk()) return;
    verAdel.disabled = true;
    zona.textContent = ""; zona.append(el("div", { className: "panel" }, el("p", { className: "hint", textContent: "Buscando tus adelantos… puede tardar unos segundos." })));
    google.script.run.withSuccessHandler(function (r) {
      verAdel.disabled = false; msg.hidden = true; zona.textContent = "";
      if (!r.visible) { zona.append(el("div", { className: "panel" }, el("h4", { textContent: "Mis adelantos" }), el("p", { className: "hint", textContent: "Los adelantos de la semana todavía no están listos. Se publican los jueves a la noche." }))); return; }
      if (r.error) { zona.append(el("div", { className: "panel" }, el("p", { className: "hint", textContent: r.error }))); return; }
      var p = el("div", { className: "panel" }, el("h4", { textContent: r.semana }));
      var bloque = function (titulo, filas) {
        if (!filas.length) return;
        p.append(el("h4", { textContent: titulo }));
        var t = el("table");
        filas.forEach(function (x) { var tr = t.insertRow(); tr.append(el("td", { className: "f", textContent: x.fecha }), el("td", { textContent: x.concepto }), el("td", { className: "m", textContent: plata(x.monto) })); });
        p.append(t);
      };
      bloque("Efectivo", r.efectivo);
      bloque("Consumos", r.consumos);
      bloque("A favor", r.aFavor);
      p.append(el("div", { className: "total" }, el("span", { textContent: "Total de la semana" }), el("b", { textContent: plata(r.total) })));
      p.append(el("p", { className: "hint" }, "Precios completos en PDF: ", el("a", { href: r.listas, target: "_blank", rel: "noopener", textContent: "abrir carpeta" })));
      zona.append(p);
    }).withFailureHandler(function (err) { verAdel.disabled = false; mostrar(err.message, true); }).misAdelantos(n, pin);
  };

  var cerrarB = el("button", { type: "button", className: "close", textContent: "Cerrar" }); cerrarB.onclick = cerrar;
  box.append(el("h3", { textContent: n }), hint, dots, teclas, acciones, msg,
    el("div", { className: "consultas" }, el("h2", { textContent: "Consultar (no marca nada)" }), el("div", { className: "two" }, verHoras, verAdel)), zona, cerrarB);
  $("sheet").hidden = false;
}

/* Pide la ubicación solo al marcar. Si no hay permiso o tarda, marca igual sin ubicación. */
function ubicacion(listo) {
  var hecho = false;
  function fin(p) { if (!hecho) { hecho = true; listo(p); } }
  setTimeout(function () { fin(null); }, 9000);
  try {
    navigator.geolocation.getCurrentPosition(
      function (p) { fin({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); },
      function () { fin(null); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  } catch (e) { fin(null); }
}

/* ---------- precios ---------- */
function cargarPrecios() {
  google.script.run.withSuccessHandler(function (r) { PRECIOS = r; $("linkPdf").href = r.listas; dibujarPrecios(); })
    .withFailureHandler(function (err) { $("notaPrecios").textContent = "No se pudieron cargar los precios: " + err.message; }).precios();
}
function sinTildes(s) { return s.toLowerCase().replace(/[áä]/g, "a").replace(/[éë]/g, "e").replace(/[íï]/g, "i").replace(/[óö]/g, "o").replace(/[úü]/g, "u"); }
function dibujarPrecios() {
  if (!PRECIOS) return;
  var lista = PRECIOS[vistaPrecio], q = sinTildes($("buscar").value.trim());
  $("notaPrecios").textContent = lista.nota;
  var box = $("listaPrecios"); box.textContent = "";
  var ultimo = null, cuantos = 0;
  lista.filas.forEach(function (f) {
    if (q && sinTildes(f[0] + " " + f[1]).indexOf(q) < 0) return;
    if (f[0] !== ultimo) { box.append(el("p", { className: "rubro", textContent: f[0] })); ultimo = f[0]; }
    box.append(el("div", { className: "precio" }, el("span", { textContent: f[1] }), el("span", { textContent: f[2] })));
    cuantos++;
  });
  if (!cuantos) box.append(el("p", { className: "hint", textContent: "No encontré nada con esa palabra." }));
}
$("segMerc").onclick = function () { vistaPrecio = "mercaderia"; $("segMerc").className = "on"; $("segPlatos").className = ""; dibujarPrecios(); };
$("segPlatos").onclick = function () { vistaPrecio = "platos"; $("segPlatos").className = "on"; $("segMerc").className = ""; dibujarPrecios(); };
$("buscar").addEventListener("input", dibujarPrecios);

cargar(); setInterval(cargar, 60000);
</script>
</body>
</html>
`;
