// Arma el .txt de precios para Resto Soft y lo deja en la carpeta RESTOSOFT de Drive.
// Va pegado en la planilla "Carta Resto Soft — platos activos" (Extensiones → Apps Script).
// Toma la última exportación "CARTA.txt" de Drive y cambia solo los precios de las filas
// que dicen CAMBIAR en la pestaña Carta (H = porción / único / chica, I = 1/2 o grande).
// Se dispara tildando la casilla Carta!N1 (anda desde el celular) o desde el menú "Resto Soft".
// Instalar una sola vez: pegar este archivo, guardar y correr la función instalar().
var CARPETA_RESTOSOFT = '1wO-WdCuwm0PtuFtz_MdcFj-uZwXlMsmZ';
var HOJA = 'Carta';
var CASILLA = 'N1';
var PRIMERA_FILA = 4;
// Tamaños de Resto Soft que toman la columna H y los que toman la columna I.
var TAMANIOS_H = ['CHICA', 'PORCION', 'CHICO'];
var TAMANIOS_I = ['GRANDE', '1/2', 'MEDIA'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Resto Soft')
    .addItem('Generar TXT de precios', 'generarTxt')
    .addToUi();
}

function instalar() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'alEditar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('alEditar').forSpreadsheet(ss).onEdit().create();
}

function alEditar(e) {
  var r = e.range;
  if (r.getSheet().getName() !== HOJA || r.getA1Notation() !== CASILLA || r.getValue() !== true) return;
  try {
    var nombre = generarTxt();
    r.getSheet().getRange('M2').setValue('Listo: ' + nombre);
  } catch (err) {
    r.getSheet().getRange('M2').setValue('Error: ' + err.message);
  }
  r.setValue(false);
}

function leerCambios() {
  var hoja = SpreadsheetApp.getActive().getSheetByName(HOJA);
  var filas = hoja.getRange(PRIMERA_FILA, 1, hoja.getLastRow() - PRIMERA_FILA + 1, 10).getValues();
  var cambios = {};
  filas.forEach(function (f) {
    if (f[9] !== 'CAMBIAR' || !f[1]) return;
    cambios[String(f[1])] = { h: f[7], i: f[8], plato: f[2] };
  });
  return cambios;
}

function ultimaCarta() {
  var it = DriveApp.getFilesByName('CARTA.txt');
  var mejor = null;
  while (it.hasNext()) {
    var f = it.next();
    if (!mejor || f.getLastUpdated() > mejor.getLastUpdated()) mejor = f;
  }
  if (!mejor) throw new Error('no encontré CARTA.txt en Drive');
  return mejor;
}

function generarTxt() {
  var cambios = leerCambios();
  var texto = ultimaCarta().getBlob().getDataAsString('ISO-8859-1');
  var lineas = texto.split('\r\n');
  var tamanios = {}, tabla = null, hechos = {};

  lineas.forEach(function (l) {
    var m = l.match(/^Nombre=(\w+)/);
    if (m) tabla = m[1];
    if (tabla === 'TAMANIOS') {
      l.replace(/<ROW idTamanio="(\d+)" Descripcion="([^"]*)"\/>/g, function (_, id, desc) {
        tamanios[id] = desc.trim();
      });
    }
  });

  tabla = null;
  for (var n = 0; n < lineas.length; n++) {
    var m = lineas[n].match(/^Nombre=(\w+)/);
    if (m) { tabla = m[1]; continue; }
    if ((tabla !== 'PLATOS' && tabla !== 'PLATOS_TAMANIOS') || lineas[n].indexOf('<ROW ') < 0) continue;
    lineas[n] = lineas[n].replace(/<ROW [^>]*\/>/g, function (row) {
      var cod = (row.match(/ idPlato="(\d+)"/) || [])[1];
      var c = cambios[cod];
      if (!c) return row;
      var precio;
      if (tabla === 'PLATOS') {
        if (row.indexOf('TamanioUnico="TRUE"') < 0) return row;
        precio = c.h;
      } else {
        var tam = tamanios[(row.match(/ idTamanio="(\d+)"/) || [])[1]] || '';
        if (TAMANIOS_H.indexOf(tam) >= 0) precio = c.h;
        else if (TAMANIOS_I.indexOf(tam) >= 0) precio = c.i;
      }
      if (typeof precio !== 'number' || !precio) return row;
      hechos[cod] = c.plato;
      return row.replace(/ Precio="[^"]*"/, ' Precio="' + Math.round(precio) + '"');
    });
  }

  var hoy = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd-MM');
  var nombre = 'PRECIOS RESTO SOFT ' + hoy + '.txt';
  var bytes = Utilities.newBlob('').setDataFromString(lineas.join('\r\n'), 'ISO-8859-1').getBytes();
  DriveApp.getFolderById(CARPETA_RESTOSOFT).createFile(Utilities.newBlob(bytes, 'text/plain', nombre));
  return nombre + ' (' + Object.keys(hechos).length + ' platos)';
}
