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

/** Marca entrada ("in") o salida ("out"). Devuelve un texto para mostrar. */
function marcar(nombre, pin, tipo) {
  const p = validar(nombre, pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = libro().getSheetByName("MARCAS");
    const marcas = leerMarcas();
    const abierta = marcas.filter(m => m.nombre === p.nombre && !m.salida).pop();
    const ahora = new Date();
    if (tipo === "in") {
      if (abierta) return { ok: false, texto: p.nombre + ", ya marcaste entrada a las " + abierta.entrada + ". Marcá la salida primero." };
      const fila = hoja.getLastRow() + 1;
      hoja.getRange(fila, 1, 1, 4).setValues([["'" + fecha(ahora), p.nombre, "'" + hora(ahora), ""]]);
      hoja.getRange(fila, 5).setFormulaR1C1('=IF(R[0]C[-1]="","",MOD(TIMEVALUE(R[0]C[-1])-TIMEVALUE(R[0]C[-2]),1)*24)');
      hoja.getRange(fila, 6, 1, 2).setValues([["app", ahora]]);
      return { ok: true, texto: "¡Listo " + p.nombre + "! Entraste a las " + hora(ahora) + "." };
    }
    if (!abierta) return { ok: false, texto: p.nombre + ", no tenés una entrada abierta. Marcá la entrada primero." };
    hoja.getRange(abierta.fila, 4).setValue("'" + hora(ahora));
    return { ok: true, texto: "¡Listo " + p.nombre + "! Saliste a las " + hora(ahora) + "." };
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
  if (mar.getLastRow() < 1) mar.getRange(1, 1, 1, 7).setValues([["Fecha", "Nombre", "Entrada", "Salida", "Horas", "Origen", "Marcado"]]);
  mar.getRange("I1").setValue("Para corregir: cambiá Entrada o Salida (HH:MM) y poné 'a mano' en Origen. Para cargar un turno olvidado, copiá una fila y cambiala.");

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
  ["SEMANA", "PERSONAL", "MARCAS", "FERIADOS"].forEach((n, i) => { ss.setActiveSheet(ss.getSheetByName(n)); ss.moveActiveSheet(i + 1); });
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
  sh.getRange("J3:M3").setValues([["HS", "Pago horas", "Propina", "Total"]]);
  sh.getRange("O1").setValue("Propina de la semana a repartir:");
  sh.getRange("R1").setValue(0).setBackground("#fff2cc").setNumberFormat("$ #,##0");
  sh.getRange("O2").setValue("Se reparte proporcional a las horas trabajadas (falta que la tesorera confirme la regla).");
  for (let f = 4; f < 4 + 40; f++) {
    sh.getRange(f, 1).setFormula('=IFERROR(INDEX(FILTER(PERSONAL!$A$2:$A,PERSONAL!$D$2:$D<>"NO",PERSONAL!$A$2:$A<>""),' + (f - 3) + '),"")');
    sh.getRange(f, 2).setFormula('=IF($A' + f + '="","",IFERROR(VLOOKUP($A' + f + ',PERSONAL!$A:$C,3,FALSE),""))');
    sh.getRange(f, 10).setFormula('=IF($A' + f + '="","",SUM(C' + f + ':I' + f + '))');
    sh.getRange(f, 11).setFormula('=IF($A' + f + '="","",ROUND(SUMPRODUCT(C' + f + ':I' + f + ',$C$2:$I$2)*B' + f + ',0))');
    sh.getRange(f, 12).setFormula('=IF($A' + f + '="","",IF(SUM($J$4:$J$43)=0,0,ROUND($R$1*J' + f + '/SUM($J$4:$J$43),0)))');
    sh.getRange(f, 13).setFormula('=IF($A' + f + '="","",K' + f + '+L' + f + ')');
  }
  sh.getRange("A44").setValue("TOTAL");
  ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"].forEach(c => sh.getRange(c + "44").setFormula("=SUM(" + c + "4:" + c + "43)"));
  sh.getRange("C4:J44").setNumberFormat("0.00");
  sh.getRange("B4:B43").setNumberFormat("$ #,##0");
  sh.getRange("K4:M44").setNumberFormat("$ #,##0");
  sh.getRange("A3:M3").setFontWeight("bold").setBackground("#1d3a66").setFontColor("#ffffff");
  sh.getRange("A44:M44").setFontWeight("bold");
  sh.setFrozenRows(3);
  sh.setFrozenColumns(1);
}
