"""Arma el .txt para importar precios en Resto Soft.

Toma la hoja "RESTO SOFT" de la planilla de costos de recetas (ya calculada,
por ejemplo descargada de Google Sheets como .xlsx) y una exportación de carta
de Resto Soft (CARTA.txt). Devuelve una copia de CARTA.txt donde solo cambian
los precios de las filas que dicen "SÍ" en la columna "Cambia".

Uso: python3 restosoft_txt.py planilla.xlsx CARTA.txt salida.txt
"""
import re
import sys

import openpyxl


def leer_cambios(xlsx):
    ws = openpyxl.load_workbook(xlsx, data_only=True)["RESTO SOFT"]
    cambios = {}
    for fila in ws.iter_rows(min_row=5, values_only=True):
        cod, cod_tam, precio_rs, precio_nuevo, cambia = fila[0], fila[1], fila[5], fila[11], fila[12]
        if cod is None or cambia != "SÍ":
            continue
        cambios[(str(int(cod)), str(int(cod_tam)) if cod_tam else "")] = (precio_rs, precio_nuevo)
    return cambios


def formato(precio):
    return str(int(precio)) if float(precio).is_integer() else f"{precio:.2f}"


def aplicar(lineas, cambios):
    tabla, hechos = None, set()
    for i, linea in enumerate(lineas):
        m = re.match(r"Nombre=(\w+)", linea)
        if m:
            tabla = m.group(1)
            continue
        if tabla not in ("PLATOS", "PLATOS_TAMANIOS") or "<ROW " not in linea:
            continue

        def cambiar(row):
            txt = row.group(0)
            cod = re.search(r' idPlato="(\d+)"', txt).group(1)
            tam = re.search(r' idTamanio="(\d+)"', txt) if tabla == "PLATOS_TAMANIOS" else None
            clave = (cod, tam.group(1) if tam else "")
            if clave not in cambios:
                return txt
            hechos.add(clave)
            return re.sub(r' Precio="[^"]*"', f' Precio="{formato(cambios[clave][1])}"', txt, count=1)

        lineas[i] = re.sub(r"<ROW [^>]*/>", cambiar, linea)
    return hechos


def main():
    xlsx, carta, salida = sys.argv[1:4]
    cambios = leer_cambios(xlsx)
    with open(carta, encoding="latin-1", newline="") as f:
        lineas = f.read().split("\r\n")
    hechos = aplicar(lineas, cambios)
    with open(salida, "w", encoding="latin-1", newline="") as f:
        f.write("\r\n".join(lineas))
    faltan = set(cambios) - hechos
    print(f"Precios cambiados: {len(hechos)}")
    if faltan:
        print("No encontrados en la carta:", sorted(faltan))


if __name__ == "__main__":
    main()
