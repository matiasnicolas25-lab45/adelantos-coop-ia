# Cómo se publican las apps de La Caleta solas (sin copiar y pegar)

Desde el 17/11/2026, cada cambio en el código de las dos apps (horarios y cuentas) se publica solo
en Google, en el mismo link de siempre. Esto explica cómo funciona, paso a paso.

## Las piezas

**Node.js.** Programa que hace correr JavaScript fuera del navegador. Lo instalamos en la compu de Mat
(`winget install OpenJS.NodeJS.LTS`) porque la herramienta de Google para Apps Script está hecha en JavaScript.
Viene con **npm**, una "tienda" de programas para Node. `npx` baja un programa de esa tienda y lo
ejecuta en el momento, sin dejarlo instalado.

**clasp.** La herramienta oficial de Google para manejar proyectos de Apps Script desde afuera del editor
(https://github.com/google/clasp). Usamos la versión 2.4.2.

**El permiso "API de Google Apps Script".** Se activa en https://script.google.com/home/usersettings.
Es la puerta que deja que un programa de afuera (clasp) toque los proyectos. Sin eso, nada funciona.

**El login (OAuth).** `npx @google/clasp@2.4.2 login` abrió el navegador, la cuenta de Mat autorizó a clasp
y Google le devolvió a la compu un **token**: una llave para subir y publicar proyectos de Apps Script
en nombre de Mat sin pedir la contraseña. Quedó guardada en `C:\Users\matia\.clasprc.json`.

**El secreto en GitHub.** El contenido de ese archivo se pegó en GitHub → Settings → Secrets and variables →
Actions, con el nombre `CLAPSPRC_JSON` (quedó con dos letras cambiadas; el programa acepta ese nombre y
también `CLASPRC_JSON`). GitHub lo guarda cifrado: nadie lo puede volver a leer, solo lo usa la automatización.
**Nunca se manda por chat ni se saca foto.**

**Los códigos de cada app (scriptId).** Están en `deploy/proyectos.json`. Se sacan en Apps Script →
engranaje (Configuración del proyecto) → "ID de la secuencia de comandos". No son secretos.
- Horarios: `179FWloV9sS966m5Hw0txZHqZRMZUjyccozy9SW6YATEPId5mJF6A3wVF`
- Cuentas: `1KrUV4pSVZOoEHifT-A1K4IiuHUOgvJ0mMdL794fNG_Gh-NZ8uAHswiU5`

Ahí también están los **deploymentId**: el código que aparece en el link `/exec` de cada app.
Gracias a eso, cada versión nueva sale en el mismo link.

## Qué pasa cuando Claude guarda un cambio

El archivo `.github/workflows/subir-apps.yml` le dice a GitHub qué hacer. Cuando cambia
`apps/horarios-google/Codigo.gs`, `apps/cuentas/Codigo.gs` o algo de `deploy/`:

1. GitHub prende una compu prestada (Linux) en sus servidores.
2. Le instala Node y clasp.
3. Escribe el secreto como `~/.clasprc.json` en esa compu.
4. Corre `deploy/subir.sh`, que para cada app:
   - `clasp push`: reemplaza el código del proyecto de Apps Script.
   - `clasp deploy --deploymentId …`: crea una versión nueva sobre la misma implementación (mismo link).
5. Apaga la compu prestada. Tarda unos 30 segundos.

Es lo mismo que antes se hacía a mano (pegar, guardar, Implementar → Nueva versión), pero lo hace GitHub
con la llave de Mat.

Para ver si una subida anduvo: GitHub → pestaña **Actions** → "Subir apps a Google". Verde = publicado.
Rojo = algo falló (el detalle está adentro).

## Cuándo hay que tocar algo

- **Si Mat cambia la contraseña de Google o saca el permiso:** la llave deja de servir. Se repite el login
  (`npx --yes @google/clasp@2.4.2 login` en la ventana negra) y se actualiza el secreto en GitHub con el
  nuevo contenido de `.clasprc.json` (lápiz al lado del secreto → pegar → Update secret).
- **Si una app empieza a usar algo nuevo de Google** (otro servicio, otro permiso): la primera vez puede
  aparecer un cartel de autorización al abrir el Apps Script. Se acepta una vez.
- **La página de WordPress (lacaleta.ycr.com.ar/app) no se toca:** lee la pantalla de la app de horarios.
- **Las planillas** no pasan por acá: Claude las cambia directo.

## Los dos links de las apps

- Horarios (socios): https://lacaleta.ycr.com.ar/app — por detrás usa
  https://script.google.com/macros/s/AKfycbwE-GsuQSuWV1dz8LhSAwIjbbUee5PL8Upl4-0bCuVJkecL7kzwfHM6HfpzoJqC8IRh/exec
- Cuentas (caja): https://script.google.com/macros/s/AKfycbysdjenNpB6LOcR7soGVgwoJWvX2gcU1QDME3joX5RB6XR7NW3ocByEdcIWR6oikUECSg/exec
