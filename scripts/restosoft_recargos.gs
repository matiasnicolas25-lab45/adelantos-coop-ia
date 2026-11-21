// Recargos de cuenta corriente → archivo para importar en Resto Soft (todos los socios de una vez).
// Va como archivo APARTE (Recargos.gs) en el Apps Script de "Cuentas La Caleta", al lado de Codigo.gs.
// Usa el cálculo de la app (recargosApp de Codigo.gs: 2,5 % cada miércoles sobre lo que se debe, hasta que se carga
// en Resto Soft). Todo lo de acá empieza con RRS_ para no chocar con la app.
// Instalar una sola vez: pegar, guardar y correr RRS_instalar().
// Uso (miércoles): 1) Raquel carga el Excel de cuentas corrientes en la app; 2) en Resto Soft, Exportar Datos de
// Ventas y subirlo (.zip) a RESTOSOFT; 3) tildar la casilla B1 de la hoja "RESTO SOFT"; 4) importar en Resto Soft
// el archivo "RECARGOS RESTO SOFT ...exp" que aparece en RESTOSOFT (Utiles → Sincronizar Datos → Importar Datos).
// Al armar el archivo, cada recargo queda anotado en la hoja RECARGOS (como "Ya lo cargué en Resto Soft"),
// así la app lo deja de sumar y no se repite.
// Cada recargo va como una factura X a cuenta corriente con el producto ACTUALIZACION (idPlato 1986, $1),
// cantidad = monto, numeración aparte X-0099-DDDDCCCC (DDDD = días desde el 1/1/2026, CCCC = código del cliente).
var RRS_CARPETA = '1wO-WdCuwm0PtuFtz_MdcFj-uZwXlMsmZ';
var RRS_HOJA_PANEL = 'RESTO SOFT';
var RRS_CASILLA = 'B1';
var RRS_ID_ACTUALIZACION = '1986';
var RRS_HORAS_MAX = 12;
var RRS_ENC = "<##TABLA>\r\n<##ENC>\r\nNombre=FacEnc\r\n</##ENC>\r\n<?xml version=\"1.0\" standalone=\"yes\"?>  <DATAPACKET Version=\"2.0\"><METADATA><FIELDS><FIELD attrname=\"Fecha\" fieldtype=\"dateTime\"/><FIELD attrname=\"Hora\" fieldtype=\"string\" WIDTH=\"5\"/><FIELD attrname=\"Tipo\" fieldtype=\"string\" WIDTH=\"2\"/><FIELD attrname=\"Nro\" fieldtype=\"string\" WIDTH=\"15\"/><FIELD attrname=\"Mesa\" fieldtype=\"i4\"/><FIELD attrname=\"idMozo\" fieldtype=\"i4\"/><FIELD attrname=\"Neto\" fieldtype=\"r8\"/><FIELD attrname=\"IVAI\" fieldtype=\"r8\"/><FIELD attrname=\"IVANI\" fieldtype=\"r8\"/><FIELD attrname=\"Descuento\" fieldtype=\"r8\"/><FIELD attrname=\"Total\" fieldtype=\"r8\"/><FIELD attrname=\"idCierre\" fieldtype=\"i4\"/><FIELD attrname=\"Anul\" fieldtype=\"string\" SUBTYPE=\"FixedChar\" WIDTH=\"1\"/><FIELD attrname=\"NombreClie\" fieldtype=\"string\" WIDTH=\"30\"/><FIELD attrname=\"idCondIvaClie\" fieldtype=\"string\" SUBTYPE=\"FixedChar\" WIDTH=\"1\"/><FIELD attrname=\"CUITClie\" fieldtype=\"string\" WIDTH=\"13\"/><FIELD attrname=\"idCliente\" fieldtype=\"i4\"/><FIELD attrname=\"Pagos\" fieldtype=\"r8\"/><FIELD attrname=\"FormaDePago\" fieldtype=\"string\" SUBTYPE=\"FixedChar\" WIDTH=\"2\"/><FIELD attrname=\"CantPersonas\" fieldtype=\"i4\"/><FIELD attrname=\"FechaEstad\" fieldtype=\"dateTime\"/><FIELD attrname=\"Puntos\" fieldtype=\"r8\"/><FIELD attrname=\"idUsrAutorizaDesc\" fieldtype=\"i4\"/><FIELD attrname=\"idPedido\" fieldtype=\"i4\"/><FIELD attrname=\"idRepartidor\" fieldtype=\"i4\"/><FIELD attrname=\"PerIB\" fieldtype=\"r8\"/><FIELD attrname=\"NroCompAsoc\" fieldtype=\"string\" WIDTH=\"15\"/><FIELD attrname=\"AperturaMesa\" fieldtype=\"dateTime\"/><FIELD attrname=\"Cobrada\" fieldtype=\"boolean\"/><FIELD attrname=\"idObsDesc\" fieldtype=\"i4\"/><FIELD attrname=\"PagosEnMesa\" fieldtype=\"r8\"/><FIELD attrname=\"ImpInt\" fieldtype=\"r8\"/><FIELD attrname=\"idUsuario\" fieldtype=\"i4\"/><FIELD attrname=\"IdOrigen\" fieldtype=\"i4\"/><FIELD attrname=\"Propina\" fieldtype=\"r8\"/><FIELD attrname=\"Cae_Nro\" fieldtype=\"string\" WIDTH=\"50\"/><FIELD attrname=\"Cae_Vto\" fieldtype=\"dateTime\"/></FIELDS><PARAMS LCID=\"1033\"/></METADATA><ROWDATA>";
var RRS_DET = "<##TABLA>\r\n<##ENC>\r\nNombre=FacDet\r\n</##ENC>\r\n<?xml version=\"1.0\" standalone=\"yes\"?>  <DATAPACKET Version=\"2.0\"><METADATA><FIELDS><FIELD attrname=\"Tipo\" fieldtype=\"string\" WIDTH=\"2\"/><FIELD attrname=\"Nro\" fieldtype=\"string\" WIDTH=\"15\"/><FIELD attrname=\"idDetalle\" fieldtype=\"i4\"/><FIELD attrname=\"idProducto\" fieldtype=\"i4\"/><FIELD attrname=\"Descripcion\" fieldtype=\"string\" WIDTH=\"50\"/><FIELD attrname=\"Cant\" fieldtype=\"r8\"/><FIELD attrname=\"PUnit\" fieldtype=\"r8\"/><FIELD attrname=\"idMozo\" fieldtype=\"i4\"/><FIELD attrname=\"idTamanio\" fieldtype=\"i4\"/><FIELD attrname=\"ImpInt\" fieldtype=\"r8\"/><FIELD attrname=\"idDetalleCombinaDe\" fieldtype=\"i4\"/><FIELD attrname=\"Obs\" fieldtype=\"string\" WIDTH=\"70\"/><FIELD attrname=\"idUsuario\" fieldtype=\"i4\"/><FIELD attrname=\"EsEntrada\" fieldtype=\"boolean\"/><FIELD attrname=\"FechaHora\" fieldtype=\"dateTime\"/></FIELDS><PARAMS LCID=\"1033\"/></METADATA><ROWDATA>";

function RRS_instalar() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'RRS_alEditar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('RRS_alEditar').forSpreadsheet(ss).onEdit().create();
}

function RRS_alEditar(e) {
  var r = e.range;
  if (r.getSheet().getName() !== RRS_HOJA_PANEL || r.getA1Notation() !== RRS_CASILLA || r.getValue() !== true) return;
  var estado = r.getSheet().getRange('B2');
  estado.setValue('Armando el archivo...');
  try {
    estado.setValue(RRS_generar());
  } catch (err) {
    estado.setValue('Error: ' + err.message);
  }
  r.setValue(false);
}

function RRS_ultimaVenta() {
  var it = DriveApp.getFolderById(RRS_CARPETA).getFiles(), mejor = null;
  while (it.hasNext()) {
    var f = it.next(), n = f.getName().toLowerCase();
    if (n.indexOf('venta') < 0 || !/\.(exp|zip)$/.test(n)) continue;
    if (!mejor || f.getLastUpdated() > mejor.getLastUpdated()) mejor = f;
  }
  if (!mejor) throw new Error('No hay exportación de ventas en la carpeta RESTOSOFT.');
  var horas = (new Date() - mejor.getLastUpdated()) / 36e5;
  if (horas > RRS_HORAS_MAX) throw new Error('La última exportación de ventas (' + mejor.getName() + ') es de hace ' + Math.round(horas) + ' horas. Exportá las ventas de hoy y subilas a RESTOSOFT.');
  var blob = mejor.getBlob();
  if (/\.zip$/i.test(mejor.getName())) {
    blob = Utilities.unzip(blob).filter(function (b) { return /\.exp$/i.test(b.getName()); })[0];
    if (!blob) throw new Error('El zip ' + mejor.getName() + ' no tiene un .exp adentro.');
  }
  return blob.getDataAsString('ISO-8859-1');
}

function RRS_tabla(texto, nombre) {
  var i = texto.indexOf('Nombre=' + nombre + '\r');
  if (i < 0) throw new Error('La exportación no tiene la tabla ' + nombre + '. ¿Es de "Exportar Datos de Ventas"?');
  return texto.substring(i, texto.indexOf('</##TABLA>', i));
}

function RRS_attr(row, k) {
  var m = row.match(new RegExp(' ' + k + '="([^"]*)"'));
  return m ? m[1] : '';
}

function RRS_num(x) {
  x = Math.round(x * 100) / 100;
  return x % 1 === 0 ? String(x) : x.toFixed(2);
}

function RRS_monto(v) {
  if (typeof v === 'number') return v;
  return Number(String(v).replace(/[$\s.]/g, '').replace(',', '.')) || 0;
}

function RRS_generar() {
  var ventas = RRS_ultimaVenta();
  var cierres = (RRS_tabla(ventas, 'FacEnc').match(/ idCierre="\d+"/g) || []).map(function (s) { return Number(s.match(/\d+/)[0]); });
  if (!cierres.length) throw new Error('La exportación de ventas no tiene ninguna venta: no sé el número de caja.');
  var idCierre = Math.max.apply(null, cierres);
  var clientes = {};
  (RRS_tabla(ventas, 'CLIENTES').match(/<ROW [^>]*\/>/g) || []).forEach(function (r) { clientes[RRS_attr(r, 'idCliente')] = r; });

  // Mismo cálculo que la pantalla de la app (función datos de Codigo.gs).
  var periodo = filas('SALDOS').map(function (r) { return fTxt(r[0]); }).sort().pop();
  if (!periodo) throw new Error('Primero cargá el Excel de cuentas corrientes en la app.');
  var inicio = fechaDato(DATO_INICIO_RECARGO), ahora = new Date(), tz = ZONA, hoy = Utilities.formatDate(ahora, tz, 'yyyy-MM-dd');
  var cargados = {};
  filas('RECARGOS').forEach(function (r) { var k = String(r[0]), f = fTxt(r[2]); if (!cargados[k] || f > cargados[k]) cargados[k] = f; });
  var mv = {};
  filas('MOVIMIENTOS').forEach(function (r) { if (fTxt(r[0]) === periodo) (mv[String(r[1])] = mv[String(r[1])] || []).push({ fecha: fTxt(r[2]), saldo: Number(r[7]) }); });
  var porCliente = {}, nombres = {}, semanas = {}, salteados = [];
  filas('SALDOS').forEach(function (r) {
    if (fTxt(r[0]) !== periodo) return;
    var cod = String(r[1]), rec = recargosApp(inicio, cargados[cod] || '', Number(r[4]), mv[cod] || [], hoy);
    if (rec.total < 1) return;
    var cli = clientes[cod];
    if (!cli) return salteados.push(String(r[2]) + ' (no está en Resto Soft)');
    if (RRS_attr(cli, 'ACtaCte') !== 'TRUE') return salteados.push(String(r[2]) + ' (sin cuenta corriente en Resto Soft)');
    porCliente[cod] = rec.total; nombres[cod] = String(r[2]); semanas[cod] = rec.semanas.length;
  });
  var cods = Object.keys(porCliente);
  if (!cods.length) return 'No hay recargos para cargar' + (inicio ? ' (la app calcula desde el ' + inicio + ')' : ' (falta la fecha de inicio en CONFIG)') + '.' +
    (salteados.length ? ' Salteados: ' + salteados.join(', ') : '');

  var fecha = Utilities.formatDate(ahora, tz, 'yyyyMMdd'), hora = Utilities.formatDate(ahora, tz, 'HH:mm');
  var fechaHora = Utilities.formatDate(ahora, tz, "yyyyMMdd'T'HH:mm:ss") + '000';
  var dias = Math.floor((ahora - new Date(2026, 0, 1)) / 864e5);

  var filasEnc = [], filasDet = [], total = 0;
  cods.forEach(function (cod) {
    var cli = clientes[cod], monto = porCliente[cod], neto = monto / 1.21;
    var nro = 'X-0099-' + ('0000' + dias).slice(-4) + ('0000' + cod).slice(-4);
    var nombre = RRS_attr(cli, 'Nombre').trim().substring(0, 30); // ya viene escapado del XML de Resto Soft
    total += monto;
    filasEnc.push('<ROW Fecha="' + fecha + '" Hora="' + hora + '" Tipo="FA" Nro="' + nro + '" Mesa="0" idMozo="0" Neto="' + RRS_num(neto) +
      '" IVAI="' + RRS_num(monto - neto) + '" IVANI="0" Descuento="0" Total="' + RRS_num(monto) + '" idCierre="' + idCierre +
      '" Anul="" NombreClie="' + nombre + '" idCondIvaClie="' + (RRS_attr(cli, 'idCondIVA') || 'C') + '" CUITClie="' +
      (RRS_attr(cli, 'CUIT') || '00-00000000-0') + '" idCliente="' + cod + '" Pagos="0" FormaDePago="CC" CantPersonas="0" FechaEstad="' +
      fecha + '" Puntos="0" PerIB="0" AperturaMesa="' + fechaHora + '" Cobrada="TRUE" PagosEnMesa="0" ImpInt="0" idUsuario="1" IdOrigen="0" Propina="0" Cae_Nro="" Cae_Vto="' + fecha + '"/>');
    filasDet.push('<ROW Tipo="FA" Nro="' + nro + '" idDetalle="1" idProducto="' + RRS_ID_ACTUALIZACION + '" Descripcion="ACTUALIZACION" Cant="' +
      RRS_num(monto) + '" PUnit="1" idTamanio="0" ImpInt="0" idUsuario="1" EsEntrada="FALSE" FechaHora="' + fechaHora + '"/>');
  });
  var cierre = '</ROWDATA></DATAPACKET>\r\n</##TABLA>\r\n';
  var texto = RRS_ENC + filasEnc.join('') + cierre + RRS_DET + filasDet.join('') + cierre;
  var bytes = [];
  for (var i = 0; i < texto.length; i++) {
    var c = texto.charCodeAt(i);
    if (c > 255) c = 63;
    bytes.push(c > 127 ? c - 256 : c);
  }
  var nombreArchivo = 'RECARGOS RESTO SOFT ' + Utilities.formatDate(ahora, tz, 'dd-MM HH.mm') + '.exp';
  DriveApp.getFolderById(RRS_CARPETA).createFile(Utilities.newBlob(bytes, 'application/octet-stream', nombreArchivo));
  var dia = Utilities.formatDate(ahora, tz, 'yyyy-MM-dd');
  var anotar = cods.map(function (cod) { return [Number(cod), nombres[cod], dia, porCliente[cod], semanas[cod], 'Archivo Resto Soft']; });
  var hr = hoja('RECARGOS');
  hr.getRange(hr.getLastRow() + 1, 1, anotar.length, 6).setValues(anotar);
  registrar('Sistema', 'Armó el archivo de recargos para Resto Soft', '', nombreArchivo + ' (' + cods.length + ' socios, $' + RRS_num(total) + ')');
  return 'Listo: "' + nombreArchivo + '" en RESTOSOFT — ' + cods.length + ' socios, $ ' + RRS_num(total) + ' (caja ' + idCierre + '). Importalo en Resto Soft (Utiles → Sincronizar Datos → Importar Datos).' +
    (salteados.length ? ' Salteados: ' + salteados.join(', ') : '');
}
