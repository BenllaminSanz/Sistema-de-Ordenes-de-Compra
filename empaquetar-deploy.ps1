# Empaqueta el proyecto para despliegue en servidor (sin node_modules, .env ni uploads de usuario)
$ErrorActionPreference = "Stop"

$raiz = $PSScriptRoot
$version = (Get-Content "$raiz\backend\package.json" -Raw | ConvertFrom-Json).version
$fecha = Get-Date -Format "yyyyMMdd-HHmm"
$zipName = "deploy-oc-v$version-$fecha.zip"
$zipPath = Join-Path $raiz $zipName

$excluir = @(
    "node_modules",
    "docs\node_modules",
    ".env",
    ".git",
    "_Respaldos",
    "backend\uploads\cotizaciones",
    "backend\uploads\referencias",
    "deploy-oc-*.zip",
    "terminals",
    ".claude"
)

Write-Host "Empaquetando Sistema OC v$version ..." -ForegroundColor Cyan

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$tempDir = Join-Path $env:TEMP "oc-deploy-$fecha"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

$omitirRaiz = @(".git", "node_modules", "_Respaldos", "terminals", ".claude")

Get-ChildItem -Path $raiz -Force | Where-Object {
    $_.Name -notin $omitirRaiz -and $_.Name -notlike "deploy-oc-*.zip"
} | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $tempDir $_.Name) -Recurse -Force
}

# Limpiar exclusiones dentro de la copia
foreach ($patron in $excluir) {
    $ruta = Join-Path $tempDir $patron
    if (Test-Path $ruta) {
        Remove-Item $ruta -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Asegurar carpetas de uploads vacías
$uploadsCot = Join-Path $tempDir "backend\uploads\cotizaciones"
$uploadsRef = Join-Path $tempDir "backend\uploads\referencias"
New-Item -ItemType Directory -Path $uploadsCot -Force | Out-Null
New-Item -ItemType Directory -Path $uploadsRef -Force | Out-Null

Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force
Remove-Item $tempDir -Recurse -Force

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "Listo: $zipName ($sizeMb MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Pasos en el servidor:" -ForegroundColor Yellow
Write-Host "  1. Respaldar carpeta actual y base de datos"
Write-Host "  2. Descomprimir el ZIP sobre la instalacion (conservar .env y backend/uploads/)"
Write-Host "  3. cd backend && npm install --omit=dev"
Write-Host "  4. Reiniciar el servicio (pm2 restart / reiniciar IIS Node / etc.)"
Write-Host "  5. Verificar http://servidor:PUERTO/api/health"