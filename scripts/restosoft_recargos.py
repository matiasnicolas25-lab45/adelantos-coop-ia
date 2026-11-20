"""Arma el .exp para importar en Resto Soft los recargos (ACTUALIZACION) de cuenta corriente.

Hace lo mismo que Yoana a mano: por cada socio, una factura X a cuenta
corriente (CC) con el producto ACTUALIZACION (idPlato 1986, $1) y cantidad
igual al monto del recargo.

Usa como molde una exportación de ventas de Resto Soft del mismo día
(Utiles > Sincronizar Datos > Exportar Datos de Ventas): de ahí copia el
formato de las tablas FacEnc y FacDet, el nombre y la condición de IVA de
cada cliente y el número de caja abierta (idCierre).

Las facturas van con punto de venta 0099 (X-0099-AAMMDDnn) para no pisar
nunca la numeración real (X-0001-...).

Uso: python3 restosoft_recargos.py ventas.exp recargos.csv salida.exp
     recargos.csv: una línea por socio, "codigo,monto" (código de cliente de Resto Soft).
"""
import csv
import datetime as dt
import re
import sys

ID_ACTUALIZACION = "1986"
PTO_VTA = "0099"


def tablas(texto):
    out = {}
    for bloque in texto.split("<##TABLA>")[1:]:
        nombre = re.search(r"Nombre=(\w+)", bloque).group(1)
        out[nombre] = "<##TABLA>" + bloque.split("</##TABLA>")[0] + "</##TABLA>"
    return out


def attr(row, k):
    m = re.search(f' {k}="([^"]*)"', row)
    return m.group(1) if m else ""


def esc(s):
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


def num(x):
    x = round(x, 2)
    return str(int(x)) if float(x).is_integer() else f"{x:.2f}"


def con_filas(bloque, filas):
    return re.sub(r"<ROWDATA>.*</ROWDATA>", lambda _: "<ROWDATA>" + "".join(filas) + "</ROWDATA>", bloque, flags=re.S)


def main():
    molde, csv_path, salida = sys.argv[1:4]
    with open(molde, encoding="latin-1", newline="") as f:
        t = tablas(f.read())

    clientes = {attr(r, "idCliente"): r for r in re.findall(r"<ROW [^>]*/>", t["CLIENTES"])}
    cierres = [int(attr(r, "idCierre")) for r in re.findall(r"<ROW [^>]*/>", t["FacEnc"])]
    if not cierres:
        sys.exit("La exportación no tiene ventas: no sé el número de caja (idCierre).")
    id_cierre = str(max(cierres))

    with open(csv_path, encoding="utf-8") as f:
        recargos = [(c.strip(), float(m)) for c, m in csv.reader(f) if c.strip() and m.strip()]

    ahora = dt.datetime.now()
    fecha, hora = ahora.strftime("%Y%m%d"), ahora.strftime("%H:%M")
    fechahora = ahora.strftime("%Y%m%dT%H:%M:%S") + f"{ahora.microsecond // 1000:03d}"
    enc, det, resumen = [], [], []
    for i, (cod, monto) in enumerate(recargos, 1):
        cli = clientes.get(cod)
        if cli is None:
            sys.exit(f"El código {cod} no está en los clientes de Resto Soft.")
        if attr(cli, "ACtaCte") != "TRUE":
            sys.exit(f"{attr(cli, 'Nombre').strip()} ({cod}) no tiene cuenta corriente habilitada.")
        nro = f"X-{PTO_VTA}-{ahora:%y%m%d}{i:02d}"
        neto = monto / 1.21
        nombre = esc(attr(cli, "Nombre").strip()[:30])
        enc.append(
            f'<ROW Fecha="{fecha}" Hora="{hora}" Tipo="FA" Nro="{nro}" Mesa="0" idMozo="0" '
            f'Neto="{num(neto)}" IVAI="{num(monto - neto)}" IVANI="0" Descuento="0" Total="{num(monto)}" '
            f'idCierre="{id_cierre}" Anul="" NombreClie="{nombre}" idCondIvaClie="{attr(cli, "idCondIVA") or "C"}" '
            f'CUITClie="{attr(cli, "CUIT") or "00-00000000-0"}" idCliente="{cod}" Pagos="0" FormaDePago="CC" '
            f'CantPersonas="0" FechaEstad="{fecha}" Puntos="0" PerIB="0" AperturaMesa="{fechahora}" '
            f'Cobrada="TRUE" PagosEnMesa="0" ImpInt="0" idUsuario="1" IdOrigen="0" Propina="0" Cae_Nro="" '
            f'Cae_Vto="{fecha}"/>'
        )
        det.append(
            f'<ROW Tipo="FA" Nro="{nro}" idDetalle="1" idProducto="{ID_ACTUALIZACION}" '
            f'Descripcion="ACTUALIZACION" Cant="{num(monto)}" PUnit="1" idTamanio="0" ImpInt="0" '
            f'idUsuario="1" EsEntrada="FALSE" FechaHora="{fechahora}"/>'
        )
        resumen.append(f"{nro}  {cod:>4}  {attr(cli, 'Nombre').strip():30}  $ {num(monto)}")

    texto = con_filas(t["FacEnc"], enc) + "\r\n" + con_filas(t["FacDet"], det) + "\r\n"
    with open(salida, "w", encoding="latin-1", newline="") as f:
        f.write(texto)
    print(f"Caja (idCierre): {id_cierre}")
    print("\n".join(resumen))
    print(f"Total: $ {num(sum(m for _, m in recargos))} en {len(recargos)} facturas")


if __name__ == "__main__":
    main()
