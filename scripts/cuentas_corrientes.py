"""Arma la planilla de cuentas corrientes de los socios.

Toma el informe "DETALLE DE CONSUMOS DE CUENTAS CORRIENTES.xls" que se exporta
de Resto Soft (Clientes → Cuentas Corrientes) y arma un .xlsx con:
- SALDOS: una fila por socio con saldo, consumos, actualizaciones, pagos,
  último pago, días sin pagar, próxima actualización y alerta.
- DETALLE: todos los comprobantes con lo que se consumió en cada uno.
- MENSAJES: el resumen de cada socio que debe, listo para WhatsApp.
- REVISAR: actualizaciones que cobraron más del 1,5% del saldo.

El porcentaje de actualización y los topes de alerta están en SALDOS!B2:B4;
las columnas que dependen de ellos son fórmulas.

Uso: python3 cuentas_corrientes.py DETALLE.xls salida.xlsx
"""
import datetime
import re
import sys

import openpyxl
import xlrd
from openpyxl.styles import Alignment, Font, PatternFill

PORCENTAJE = 0.015
TOPE_MONTO = 100000
TOPE_DIAS = 30


def fecha(txt):
    d, m, a = map(int, txt.split("/"))
    return datetime.date(a, m, d)


def pesos(n):
    txt = f"{abs(n):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    txt = txt[:-3] if txt.endswith(",00") else txt
    return ("-$" if n < 0 else "$") + txt


def leer(xls):
    hoja = xlrd.open_workbook(xls, encoding_override="cp1252").sheet_by_index(0)
    clientes, cli, desde, hasta = [], None, None, None
    for r in range(hoja.nrows):
        a, b, debe, haber, _, saldo = hoja.row_values(r)
        if isinstance(a, str) and a.startswith("Cliente:"):
            m = re.match(r"\((\d+)\)\s*(.*)", a[8:].strip())
            cli = dict(codigo=int(m.group(1)), nombre=m.group(2).strip(), dom="", tel="",
                       anterior=0.0, actual=0.0, movs=[])
            clientes.append(cli)
        elif cli is None:
            continue
        elif isinstance(a, str) and a.startswith("Domicilio:"):
            cli["dom"] = a[10:].strip()
        elif isinstance(a, str) and a.startswith("Telefono:"):
            cli["tel"] = a[9:].strip()
        elif isinstance(b, str) and "Saldo Anterior" in b:
            cli["anterior"], desde = saldo, fecha(a)
        elif isinstance(b, str) and "Saldo Actual" in b:
            cli["actual"], hasta = saldo, fecha(a)
        elif isinstance(a, str) and re.match(r"\d+/\d+/\d{4}$", a):
            cli["movs"].append(dict(fecha=fecha(a), comp=b.strip(), debe=debe, haber=haber,
                                    saldo=saldo, items=[]))
        elif isinstance(a, float) and b and cli["movs"]:
            cli["movs"][-1]["items"].append(dict(cant=a, desc=b.strip(), importe=haber))
    for c in clientes:
        saldo = c["anterior"]
        for m in c["movs"]:
            m["previo"], saldo = saldo, m["saldo"]
            m["tipo"] = ("Pago" if m["comp"].startswith("RE")
                         else "Actualización" if m["items"] and all(i["desc"] == "ACTUALIZACION" for i in m["items"])
                         else "Consumo")
    return clientes, desde, hasta


def titulo(ws, fila, encabezados, anchos):
    for col, (txt, ancho) in enumerate(zip(encabezados, anchos), 1):
        celda = ws.cell(fila, col, txt)
        celda.font = Font(bold=True, color="FFFFFF")
        celda.fill = PatternFill("solid", fgColor="1F4E78")
        ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width = ancho
    ws.freeze_panes = ws.cell(fila + 1, 1)


def hoja_saldos(wb, clientes, desde, hasta):
    ws = wb.active
    ws.title = "SALDOS"
    ws["A1"] = f"Cuentas corrientes de socios — Resto Soft del {desde:%d/%m/%Y} al {hasta:%d/%m/%Y}"
    ws["A1"].font = Font(bold=True, size=13)
    for fila, (txt, valor, fmt) in enumerate([("Actualización semanal (miércoles)", PORCENTAJE, "0.0%"),
                                              ("Avisar si debe más de", TOPE_MONTO, "$ #,##0"),
                                              ("Avisar si no paga hace más de (días)", TOPE_DIAS, "0")], 2):
        ws.cell(fila, 1, txt)
        ws.cell(fila, 2, valor).number_format = fmt
        ws.cell(fila, 2).fill = PatternFill("solid", fgColor="FFF2CC")
    ws["D2"], ws["E2"] = "Fecha del informe", hasta
    ws["E2"].number_format = "dd/mm/yyyy"

    enc = ["Código", "Socio", "Teléfono", "Saldo anterior", "Consumos", "Actualizaciones", "Pagos",
           "Saldo actual", "Último pago", "Días sin pagar", "Próxima actualización", "Alerta"]
    titulo(ws, 6, enc, [8, 32, 14, 15, 15, 15, 15, 15, 12, 10, 15, 22])
    fila = 7
    for c in sorted(clientes, key=lambda c: -c["actual"]):
        if not c["movs"] and abs(c["actual"]) < 1:
            continue
        pagos = [m for m in c["movs"] if m["tipo"] == "Pago"]
        valores = [c["codigo"], c["nombre"] or "(sin nombre en Resto Soft)", c["tel"], c["anterior"],
                   sum(m["debe"] for m in c["movs"] if m["tipo"] == "Consumo"),
                   sum(m["debe"] for m in c["movs"] if m["tipo"] == "Actualización"),
                   sum(m["haber"] for m in c["movs"]), c["actual"],
                   pagos[-1]["fecha"] if pagos else None]
        for col, v in enumerate(valores, 1):
            ws.cell(fila, col, v)
        ws.cell(fila, 10, f'=IF(H{fila}<=0,"",IF(I{fila}="","más de "&($E$2-DATE({desde:%Y,%m,%d}))&"",$E$2-I{fila}))')
        ws.cell(fila, 11, f'=IF(H{fila}>0,ROUND(H{fila}*$B$2,0),0)')
        ws.cell(fila, 12, f'=IF(H{fila}<=0,"",IF(H{fila}>$B$3,"Debe mucho",'
                          f'IF(OR(I{fila}="",$E$2-I{fila}>$B$4),"Hace mucho que no paga","")))')
        for col in range(4, 9):
            ws.cell(fila, col).number_format = "$ #,##0.00"
        ws.cell(fila, 9).number_format = "dd/mm/yyyy"
        ws.cell(fila, 11).number_format = "$ #,##0"
        fila += 1
    ws.cell(fila + 1, 2, "TOTAL").font = Font(bold=True)
    for col in range(4, 9):
        letra = openpyxl.utils.get_column_letter(col)
        celda = ws.cell(fila + 1, col, f"=SUM({letra}7:{letra}{fila - 1})")
        celda.font, celda.number_format = Font(bold=True), "$ #,##0.00"
    ws.cell(fila + 2, 2, "Deben (solo saldos positivos)")
    ws.cell(fila + 2, 8, f'=SUMIF(H7:H{fila - 1},">0")').number_format = "$ #,##0.00"
    ws.cell(fila + 3, 2, "A favor (saldos negativos)")
    ws.cell(fila + 3, 8, f'=SUMIF(H7:H{fila - 1},"<0")').number_format = "$ #,##0.00"
    ws.auto_filter.ref = f"A6:L{fila - 1}"


def hoja_detalle(wb, clientes):
    ws = wb.create_sheet("DETALLE")
    titulo(ws, 1, ["Código", "Socio", "Fecha", "Comprobante", "Tipo", "Debe", "Haber", "Saldo", "Detalle"],
           [8, 30, 12, 22, 14, 13, 13, 13, 80])
    fila = 2
    for c in clientes:
        for m in c["movs"]:
            detalle = ", ".join(f'{i["cant"]:g} {i["desc"]}' if i["cant"] != 1 else i["desc"] for i in m["items"])
            for col, v in enumerate([c["codigo"], c["nombre"], m["fecha"], m["comp"], m["tipo"],
                                     m["debe"], m["haber"], m["saldo"], detalle], 1):
                ws.cell(fila, col, v)
            ws.cell(fila, 3).number_format = "dd/mm/yyyy"
            for col in (6, 7, 8):
                ws.cell(fila, col).number_format = "$ #,##0.00"
            fila += 1
    ws.auto_filter.ref = f"A1:I{fila - 1}"


def cosas(items):
    cuenta = {}
    for i in items:
        desc = i["desc"].strip("* ").lower()
        cuenta[desc] = cuenta.get(desc, 0) + i["cant"]
    return ", ".join(d if n == 1 else f"{n:g} {d}" for d, n in cuenta.items())


def mensaje(c, desde, hasta):
    nombre = re.sub(r"^\d+\s+", "", c["nombre"].split("(")[0]).strip().title() or f"socio {c['codigo']}"
    lineas = [f"Hola {nombre}! Te paso el resumen de tu cuenta en La Caleta "
              f"del {desde:%d/%m} al {hasta:%d/%m}:", ""]
    if abs(c["anterior"]) >= 1:
        lineas.append(f"Saldo al {desde:%d/%m}: {pesos(c['anterior'])}")
    dias = {}
    for m in c["movs"]:
        dias.setdefault(m["fecha"], []).append(m)
    for dia, movs in dias.items():
        consumos = [m for m in movs if m["tipo"] == "Consumo"]
        if consumos:
            items = [i for m in consumos for i in m["items"]]
            lineas.append(f"{dia:%d/%m} – {cosas(items)}: {pesos(sum(m['debe'] for m in consumos))}")
        for m in movs:
            if m["tipo"] == "Actualización":
                lineas.append(f"{dia:%d/%m} – actualización semanal: {pesos(m['debe'])}")
            elif m["tipo"] == "Pago":
                lineas.append(f"{dia:%d/%m} – pagaste {pesos(m['haber'])}")
    lineas += ["", f"*Saldo a pagar: {pesos(c['actual'])}*", "",
               "Recordá que los miércoles se actualiza el saldo que no esté pago. ¡Gracias!"]
    return "\n".join(lineas)


def hoja_mensajes(wb, clientes, desde, hasta):
    ws = wb.create_sheet("MENSAJES")
    titulo(ws, 1, ["Código", "Socio", "Teléfono", "Saldo", "Mensaje para WhatsApp"], [8, 30, 14, 14, 100])
    fila = 2
    for c in sorted(clientes, key=lambda c: -c["actual"]):
        if c["actual"] < 1:
            continue
        for col, v in enumerate([c["codigo"], c["nombre"], c["tel"], c["actual"], mensaje(c, desde, hasta)], 1):
            ws.cell(fila, col, v)
        ws.cell(fila, 4).number_format = "$ #,##0.00"
        ws.cell(fila, 5).alignment = Alignment(wrap_text=True, vertical="top")
        fila += 1


def hoja_revisar(wb, clientes):
    ws = wb.create_sheet("REVISAR")
    titulo(ws, 1, ["Código", "Socio", "Fecha", "Comprobante", "Saldo antes", "Actualización cobrada",
                   "% cobrado", "Con 1,5% daba", "Diferencia"], [8, 30, 12, 22, 14, 14, 10, 14, 13])
    fila = 2
    for c in clientes:
        for m in c["movs"]:
            if m["tipo"] != "Actualización" or m["previo"] <= 0:
                continue
            pct = m["debe"] / m["previo"]
            if m["debe"] - round(m["previo"] * PORCENTAJE) < 100:
                continue
            for col, v in enumerate([c["codigo"], c["nombre"], m["fecha"], m["comp"], m["previo"], m["debe"],
                                     pct, round(m["previo"] * PORCENTAJE), m["debe"] - round(m["previo"] * PORCENTAJE)], 1):
                ws.cell(fila, col, v)
            ws.cell(fila, 3).number_format = "dd/mm/yyyy"
            ws.cell(fila, 7).number_format = "0.0%"
            for col in (5, 6, 8, 9):
                ws.cell(fila, col).number_format = "$ #,##0.00"
            fila += 1
    ws.cell(fila + 1, 1, "Solo se listan las actualizaciones que cobraron más de $100 por encima del 1,5% del saldo.")


def main():
    xls, salida = sys.argv[1:3]
    clientes, desde, hasta = leer(xls)
    wb = openpyxl.Workbook()
    hoja_saldos(wb, clientes, desde, hasta)
    hoja_detalle(wb, clientes)
    hoja_mensajes(wb, clientes, desde, hasta)
    hoja_revisar(wb, clientes)
    wb.save(salida)
    deben = [c for c in clientes if c["actual"] >= 1]
    print(f"{len(clientes)} cuentas, {len(deben)} deben {pesos(sum(c['actual'] for c in deben))}")


if __name__ == "__main__":
    main()
