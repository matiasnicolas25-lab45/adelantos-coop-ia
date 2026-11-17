#!/usr/bin/env bash
# Sube cada programa a su proyecto de Apps Script y, si es una app web, publica una versión nueva en el MISMO link (/exec).
# Lo corre GitHub Actions al guardar cambios (.github/workflows/subir-apps.yml). Necesita ~/.clasprc.json (secreto).
set -euo pipefail
cd "$(dirname "$0")/.."
for app in $(jq -r 'keys[] | select(startswith("_") | not)' deploy/proyectos.json); do
  sid=$(jq -r ".$app.scriptId // \"\"" deploy/proyectos.json)
  parent=$(jq -r ".$app.parentId // \"\"" deploy/proyectos.json)
  dep=$(jq -r ".$app.deploymentId // \"\"" deploy/proyectos.json)
  dir=$(mktemp -d)
  if [ -z "$sid" ]; then
    if [ -z "$parent" ]; then echo "⏭  $app: falta el scriptId en deploy/proyectos.json, no se sube."; continue; fi
    # Proyecto nuevo pegado a una planilla: se crea una sola vez. Después hay que copiar el scriptId a proyectos.json.
    # Se crea con la API de Apps Script directo (clasp create se queda esperando una respuesta).
    rt=$(jq -r '.token.refresh_token' ~/.clasprc.json); ci=$(jq -r '.oauth2ClientSettings.clientId' ~/.clasprc.json); cs=$(jq -r '.oauth2ClientSettings.clientSecret' ~/.clasprc.json)
    at=$(curl -sS --max-time 60 https://oauth2.googleapis.com/token -d client_id="$ci" -d client_secret="$cs" -d refresh_token="$rt" -d grant_type=refresh_token | jq -r .access_token)
    sid=$(curl -sS --max-time 60 -X POST https://script.googleapis.com/v1/projects -H "Authorization: Bearer $at" -H "Content-Type: application/json" \
      -d "{\"title\":\"La Caleta - $app\",\"parentId\":\"$parent\"}" | jq -r '.scriptId // empty')
    if [ -z "$sid" ]; then echo "❌ $app: no se pudo crear el proyecto"; exit 1; fi
    echo "🆕 $app: proyecto creado. SCRIPT_ID_NUEVO_${app}=$sid"
  fi
  cp "$(jq -r ".$app.codigo" deploy/proyectos.json)" "$dir/Codigo.js"
  if jq -e ".$app.webapp" deploy/proyectos.json >/dev/null; then
    jq -n --argjson w "$(jq ".$app.webapp" deploy/proyectos.json)" \
      '{timeZone:"America/Argentina/Buenos_Aires", runtimeVersion:"V8", exceptionLogging:"STACKDRIVER", webapp:$w}' > "$dir/appsscript.json"
  else
    echo '{"timeZone":"America/Argentina/Buenos_Aires","runtimeVersion":"V8","exceptionLogging":"STACKDRIVER"}' > "$dir/appsscript.json"
  fi
  echo "{\"scriptId\":\"$sid\",\"rootDir\":\"$dir\"}" > "$dir/.clasp.json"
  (cd "$dir" && timeout 180 clasp push --force < /dev/null)
  if [ -n "$dep" ]; then
    (cd "$dir" && timeout 180 clasp deploy --deploymentId "$dep" --description "auto $(date -u +%Y-%m-%d) ${GITHUB_SHA:0:7}" < /dev/null)
    echo "✅ $app subida y publicada."
  else
    echo "✅ $app subida (no es app web, no hace falta publicar)."
  fi
done
