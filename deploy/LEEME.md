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

## Pruebas antes de publicar

Antes de subir nada, GitHub corre `deploy/probar.js`: revisa que los programas no tengan errores de escritura
y prueba lo delicado (horas de salida, facturas, notas de crédito, recuperar facturas de ARCA) con datos
simulados, sin tocar ARCA ni las planillas de verdad. **Si una prueba falla, no se publica nada** y las apps
siguen con la versión anterior. En GitHub → Actions se ve cuál falló.

## Volver atrás (si una versión sale mal)

Cada publicación queda en GitHub → **Actions** → "Subir apps a Google", una por cambio, con su fecha.
Para volver a una versión anterior:
1. Entrar a esa lista y abrir la **última publicación que andaba bien** (en verde).
2. Arriba a la derecha: **Re-run all jobs** (Volver a ejecutar).
3. En unos 30 segundos las dos apps vuelven a ese código, en el mismo link.

También se le puede pedir a Claude "volvé atrás": deshace el último cambio en el repositorio y se publica solo.
Ojo: el próximo cambio que se guarde vuelve a publicar lo último.

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

## Glosario (palabras para entender lo técnico)

- **Símbolo del sistema (cmd):** la ventana negra de Windows donde se escriben órdenes. Se abre con la tecla Windows y escribiendo `cmd`.
- **Terminal o consola:** el nombre general de esa ventana. En Windows se llama Símbolo del sistema; en Mac, Terminal.
- **Comando:** cada orden que se escribe en la terminal y se ejecuta con Enter. Por ejemplo `winget install …` o `npx … login`.
- **Interfaz gráfica:** lo contrario de la terminal: ventanas, botones y menús que se usan con el mouse.
- **Instalar un paquete:** bajar un programa desde una "tienda" por comando. **winget** es la tienda de Windows; **npm** es la tienda de programas para Node.
- **Node.js:** programa que hace correr JavaScript en la compu, fuera del navegador.
- **JavaScript:** el lenguaje de programación de las páginas web. Las dos apps de La Caleta están escritas en él.
- **Apps Script:** el lugar de Google donde viven los programas de las apps, pegados a las planillas.
- **Repositorio (repo):** la carpeta en GitHub donde está guardado todo el código de las apps, con el historial de cada cambio.
- **GitHub:** el sitio donde está el repositorio.
- **Commit:** cada cambio guardado en el repositorio, con una nota de qué se hizo.
- **Rama (branch):** una línea de trabajo dentro del repositorio. La de las apps se llama `apps`.
- **Deploy (implementar o publicar):** poner una versión nueva del programa en funcionamiento para que la gente la use.
- **Versión:** cada foto del programa publicada. Google guarda todas; el link `/exec` muestra la última.
- **Token:** llave digital que reemplaza a la contraseña para que un programa actúe en tu nombre.
- **OAuth:** el sistema de "Iniciar sesión con Google" que se usó para dar ese token.
- **Secreto:** un dato privado (como el token) guardado cifrado en GitHub. Nadie lo puede volver a leer.
- **API:** la puerta por la que un programa habla con otro. "Activar la API de Apps Script" fue abrir esa puerta.
- **Automatización o pipeline:** pasos que la compu hace sola cuando pasa algo. Acá: GitHub publica las apps cuando se guarda un cambio.
- **GitHub Actions:** la parte de GitHub que corre esas automatizaciones.
- **Workflow:** el archivo con la receta de una automatización (`.github/workflows/subir-apps.yml`).
