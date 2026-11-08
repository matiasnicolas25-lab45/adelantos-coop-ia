/**
 * Horarios La Caleta — app de entrada y salida montada en Google Sheets.
 *
 * Cada asociado abre el link, toca su nombre, pone su PIN y marca Entré / Salí.
 * Las marcas caen en la hoja MARCAS; la hoja SEMANA arma la semana de sábado
 * a viernes con horas, valor hora, feriados y propina proporcional a las horas.
 *
 * Instalación (una sola vez): ver LEEME.md en esta misma carpeta.
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
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Horarios La Caleta")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Nombres y quién está adentro ahora (sin PIN ni valores). */
function estado() {
  const personas = leerPersonal().filter(p => p.activo).map(p => p.nombre);
  const abiertos = {};
  for (const m of leerMarcas()) if (!m.salida) abiertos[m.nombre] = { fecha: m.fecha, entrada: m.entrada };
  return { personas, abiertos, ahora: hora(new Date()), hoy: fecha(new Date()) };
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
      return { ok: true, texto: "¡Listo " + p.nombre + "! Entraste a las " + hora(ahora) + "." + lugar.aviso };
    }
    if (!abierta) return { ok: false, texto: p.nombre + ", no tenés una entrada abierta. Marcá la entrada primero." };
    hoja.getRange(abierta.fila, 4).setValue("'" + hora(ahora));
    hoja.getRange(abierta.fila, 9).setValue(lugar.texto);
    hoja.getRange(abierta.fila, 11).setValue(lugar.coord);
    return { ok: true, texto: "¡Listo " + p.nombre + "! Saliste a las " + hora(ahora) + "." + lugar.aviso };
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
  return v.filter(r => r[0]).map(r => ({ nombre: r[0].trim(), pin: String(r[1]).trim(), activo: r[3].trim().toUpperCase() !== "NO" }));
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

function validar(nombre, pin) {
  const p = leerPersonal().find(x => x.nombre === nombre && x.activo);
  if (!p) throw new Error("No encuentro a " + nombre + " en la lista.");
  if (!p.pin || p.pin !== String(pin).trim()) throw new Error("PIN incorrecto.");
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
    const usados = new Set();
    const pin = () => { let p; do { p = String(1000 + Math.floor(Math.random() * 9000)); } while (usados.has(p)); usados.add(p); return p; };
    per.getRange(1, 1, 1, 4).setValues([["Nombre", "PIN", "Valor hora", "Activo"]]);
    per.getRange(2, 1, PERSONAL_INICIAL.length, 4).setValues(PERSONAL_INICIAL.map(([n, v]) => [n, "'" + pin(), v, "SÍ"]));
    per.getRange("F1").setValue("Valores de la hora: básica + antigüedad 09/26. Para dar de baja a alguien, poné NO en Activo.");
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
