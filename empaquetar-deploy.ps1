# ── Empaqueta el proyecto para deploy (excluye node_modules, .env, uploads) ──
# Ejecutar desde la raíz del proyecto:
#   powershell -ExecutionPolicy Bypass -File .\empaquetar-deploy.ps1

$proyecto  = Split-Path -Parent $MyInvocation.MyCommand.Path
$fecha     = Get-Date -Format "yyyy-MM-dd_HHmm"
$staging   = "$env:TEMP\deploy-oc-$fecha"
$destino   = "$proyecto\deploy-oc-$fecha.zip"

Write-Host ""
Write-Host "=== Empaquetando Sistema de Ordenes de Compra ===" -ForegroundColor Cyan
Write-Host "Staging: $staging"
Write-Host "ZIP destino: $destino`n"

# Crear carpeta staging
New-Item -ItemType Directory -Path $staging -Force | Out-Null

# Copiar backend (sin node_modules, uploads, scripts obsoletos)
robocopy "$proyecto\backend" "$staging\backend" /E /XD node_modules uploads /XF .env /NFL /NDL /NJH /NJS

# Copiar frontend
robocopy "$proyecto\frontend" "$staging\frontend" /E /NFL /NDL /NJH /NJS

# Copiar raíz (solo archivos esenciales)
Copy-Item "$proyecto\.env.example" "$staging\" -ErrorAction SilentlyContinue
Copy-Item "$proyecto\README.md"    "$staging\" -ErrorAction SilentlyContinue

# Crear el ZIP
Write-Host "Comprimiendo..." -ForegroundColor Yellow
Compress-Archive -Path "$staging\*" -DestinationPath $destino -Force

# Limpiar staging
Remove-Item -Recurse -Force $staging

$size = [math]::Round((Get-Item $destino).Length / 1MB, 1)
Write-Host ""
Write-Host "ZIP creado: $destino ($size MB)" -ForegroundColor Green
Write-Host "Transfierelo al servidor con UltraVNC File Transfer."
Write-Host ""
