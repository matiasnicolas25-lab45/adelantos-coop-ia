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

const PERSONAL_INICIAL = [
  ["Alejandra", 8807], ["Ana Julia", 9069], ["Belén", 9243], ["Braian", 8894], ["Franco", 8894],
  ["Julia", 9941], ["Laura", 9941], ["Leticia", 7499], ["Luis", 9330], ["Luna", 8894],
  ["Matías", 9069], ["Mónica", 9766], ["Natalia", 9069], ["Raquel", 9941], ["Romina", 9156],
  ["Silvia", 9069], ["Yasmila", 8894], ["Yoana", 9069],
];

/* ---------------- web app ---------------- */

function doGet() {
  return HtmlService.createHtmlOutput(PANTALLA)
    .setTitle("Horarios La Caleta")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Nombres y quién está adentro ahora (sin PIN ni valores). */
function estado() {
  const activos = leerPersonal().filter(p => p.activo);
  const personas = activos.map(p => p.nombre), sinPin = activos.filter(p => !p.pin).map(p => p.nombre);
  const abiertos = {};
  for (const m of leerMarcas()) if (!m.salida) abiertos[m.nombre] = { fecha: m.fecha, entrada: m.entrada };
  return { personas, sinPin, abiertos, ahora: hora(new Date()), hoy: fecha(new Date()) };
}

/** Marca entrada ("in") o salida ("out"). `pos` = {lat, lon, acc} del celular o null. */
function marcar(nombre, pin, tipo, pos) {
  const p = validar(nombre, pin);
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
  return v.map((r, i) => ({ fila: i + 2, nombre: r[0].trim(), pin: String(r[1]).trim(), activo: r[3].trim().toUpperCase() !== "NO" }))
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
    per.getRange(1, 1, 1, 4).setValues([["Nombre", "PIN", "Valor hora", "Activo"]]);
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
    cfg.getRange(1, 1, 4, 2).setValues([["Dato", "Valor"], ["Latitud del club", -32.900235], ["Longitud del club", -60.681259], ["Radio en metros", 150]]);
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
<title>Horarios La Caleta</title>
<style>
  :root { --paper:#f3f5f7; --card:#fff; --ink:#14213a; --muted:#5b6577; --line:#d5dbe3; --navy:#1d3a66; --in:#1f7a4d; --in-bg:#e3f3ea; --out:#a33a2c; --ochre:#b8741a; }
  @media (prefers-color-scheme: dark) { :root { --paper:#0f1522; --card:#172033; --ink:#e8edf5; --muted:#9aa6b8; --line:#2a3550; --navy:#7fa6e0; --in:#5fd39a; --in-bg:#16342a; --out:#ef8c7d; --ochre:#e0a24f; color-scheme: dark; } }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.4 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 18px 16px 40px; display: grid; gap: 16px; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 24px; }
  .clock { font-size: 30px; font-weight: 700; color: var(--navy); font-variant-numeric: tabular-nums; }
  .hint { color: var(--muted); margin: 0; }
  .people { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
  .person { text-align: left; font: 600 16px inherit; font-family: inherit; padding: 12px; min-height: 60px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); color: var(--ink); cursor: pointer; }
  .person small { display: block; font-weight: 500; font-size: 12px; color: var(--muted); }
  .person.inside { border-color: var(--in); background: var(--in-bg); }
  .person.inside small { color: var(--in); }
  .sheet { position: fixed; inset: 0; background: rgba(10,15,25,.5); display: grid; place-items: end center; }
  .box { background: var(--card); width: min(480px, 100%); border-radius: 16px 16px 0 0; padding: 20px 16px 28px; display: grid; gap: 14px; max-height: 92vh; overflow: auto; }
  @media (min-width: 600px) { .sheet { place-items: center; } .box { border-radius: 16px; } }
  .box h2 { margin: 0; font-size: 22px; }
  input { font-size: 28px; letter-spacing: .4em; text-align: center; padding: 10px; border: 1px solid var(--line); border-radius: 10px; width: 100%; background: var(--paper); color: var(--ink); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .btn { font: 700 18px inherit; font-family: inherit; padding: 16px; border: 0; border-radius: 12px; cursor: pointer; color: #fff; }
  .in { background: var(--in); } .out { background: var(--out); }
  .plain { font: 600 15px inherit; font-family: inherit; padding: 10px 14px; border: 1px solid var(--line); border-radius: 10px; background: transparent; color: var(--ink); cursor: pointer; }
  .btn:disabled, .plain:disabled { opacity: .4; }
  .msg { padding: 12px; border-radius: 10px; background: var(--in-bg); font-weight: 600; }
  .msg.err { background: #fbe4e1; color: #7a1f14; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  td { padding: 6px 4px; border-bottom: 1px solid var(--line); vertical-align: top; }
  td:last-child { text-align: right; font-weight: 700; }
  :focus-visible { outline: 3px solid var(--ochre); outline-offset: 2px; }
</style>
</head>
<body>
<div class="wrap">
  <header><h1>Horarios La Caleta</h1><div class="clock" id="clock">--:--</div></header>
  <p class="hint" id="hint">Cargando…</p>
  <div class="people" id="people"></div>
</div>
<div class="sheet" id="sheet" hidden><div class="box" id="box"></div></div>

<script>
const DIAS = ["Sáb", "Dom", "Lun", "Mar", "Mié", "Jue", "Vie"];
let estado = { personas: [], abiertos: {} };
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
function tick() { const d = new Date(); $("clock").textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()); }
tick(); setInterval(tick, 15000);
function hs(h) { const m = Math.round(h * 60); return Math.floor(m / 60) + ":" + pad(m % 60); }
function el(tag, props, ...kids) { const e = document.createElement(tag); Object.assign(e, props || {}); e.append(...kids); return e; }

function cargar() {
  google.script.run.withSuccessHandler(e => { estado = e; dibujar(); })
    .withFailureHandler(err => { $("hint").textContent = "No se pudo cargar: " + err.message; }).estado();
}
function dibujar() {
  $("hint").textContent = "Tocá tu nombre para marcar entrada o salida.";
  const box = $("people"); box.textContent = "";
  for (const n of estado.personas) {
    const a = estado.abiertos[n];
    const b = el("button", { className: "person" + (a ? " inside" : ""), type: "button" }, n,
      el("small", { textContent: a ? "Adentro desde las " + a.entrada : "Afuera" }));
    b.onclick = () => abrir(n); box.append(b);
  }
}
function cerrar() { $("sheet").hidden = true; $("box").textContent = ""; cargar(); }
$("sheet").addEventListener("click", e => { if (e.target.id === "sheet") cerrar(); });

function abrir(nombre) {
  const a = estado.abiertos[nombre], box = $("box"); box.textContent = "";
  const pin = el("input", { type: "password", inputMode: "numeric", maxLength: 4, autocomplete: "off", id: "pin", placeholder: "PIN" });
  const msg = el("div", { className: "msg", hidden: true });
  const bin = el("button", { className: "btn in", type: "button", textContent: "Entré", disabled: !!a });
  const bout = el("button", { className: "btn out", type: "button", textContent: "Salí", disabled: !a });
  const ver = el("button", { className: "plain", type: "button", textContent: "Ver mis horas de la semana" });
  const volver = el("button", { className: "plain", type: "button", textContent: "Cerrar" });
  const tabla = el("div");
  function enviar(tipo, btn) {
    if (pin.value.length !== 4) { mostrar("Poné tu PIN de 4 números.", true); return; }
    btn.disabled = true; mostrar("Buscando tu ubicación…", false);
    ubicacion(pos => {
      google.script.run.withSuccessHandler(r => { mostrar(r.texto, !r.ok); if (r.ok) setTimeout(cerrar, /Ojo|PIN/.test(r.texto) ? 6000 : 1800); else btn.disabled = false; })
        .withFailureHandler(err => { mostrar(err.message, true); btn.disabled = false; }).marcar(nombre, pin.value, tipo, pos);
    });
  }
  function mostrar(t, err) { msg.textContent = t; msg.className = "msg" + (err ? " err" : ""); msg.hidden = false; }
  bin.onclick = () => enviar("in", bin);
  bout.onclick = () => enviar("out", bout);
  volver.onclick = cerrar;
  ver.onclick = () => {
    if (pin.value.length !== 4) { mostrar("Poné tu PIN de 4 números.", true); return; }
    google.script.run.withSuccessHandler(r => {
      tabla.textContent = "";
      const t = el("table");
      r.dias.forEach((d, i) => { const tr = t.insertRow(); tr.insertCell().textContent = DIAS[i] + " " + d.fecha.slice(8) + "/" + d.fecha.slice(5, 7);
        tr.insertCell().textContent = d.turnos.join(", ") || "—"; tr.insertCell().textContent = d.horas ? hs(d.horas) : ""; });
      const tr = t.insertRow(); tr.insertCell().textContent = "Total"; tr.insertCell(); tr.insertCell().textContent = hs(r.total);
      tabla.append(t);
    }).withFailureHandler(err => mostrar(err.message, true)).misHoras(nombre, pin.value);
  };
  box.append(el("h2", { textContent: nombre }),
    el("p", { className: "hint", textContent: (estado.sinPin || []).includes(nombre)
      ? "Primera vez: elegí 4 números que te acuerdes. Ese va a ser tu PIN de ahora en adelante."
      : a ? "Entraste a las " + a.entrada + ". Poné tu PIN y tocá Salí." : "Poné tu PIN y tocá Entré." }),
    pin, el("div", { className: "two" }, bin, bout), msg, ver, tabla, volver);
  $("sheet").hidden = false; pin.focus();
}
/* Pide la ubicación solo al marcar. Si no hay permiso o tarda, marca igual sin ubicación. */
function ubicacion(listo) {
  let hecho = false; const fin = p => { if (!hecho) { hecho = true; listo(p); } };
  setTimeout(() => fin(null), 9000);
  try {
    navigator.geolocation.getCurrentPosition(
      p => fin({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      () => fin(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  } catch (e) { fin(null); }
}
cargar(); setInterval(cargar, 60000);
</script>
</body>
</html>
`;
