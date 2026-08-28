# Versionado del proyecto

Este repositorio usa **[Semantic Versioning](https://semver.org/lang/es/)** (`MAJOR.MINOR.PATCH`) y tags Git con el prefijo `v` (ejemplo: `v1.7.0`).

## Fuentes de verdad

| Qué | Dónde |
|-----|--------|
| Número de versión de la app | `backend/package.json` → campo `"version"` |
| Historial de cambios | `CHANGELOG.md` |
| Punto fijo en Git | tag anotado `vX.Y.Z` |
| Publicación en GitHub | Releases del repositorio (a partir del tag) |
| Guía de despliegue de la versión actual | `DESPLIEGUE-vX.Y.Z.md` |

El `package-lock.json` del backend debe llevar la misma versión que `package.json`.

## Cómo elegir el número

| Tipo | Cuándo | Ejemplo |
|------|--------|---------|
| **PATCH** (`1.6.1` → `1.6.2`) | Correcciones y ajustes pequeños sin romper uso existente | bug de export, plantilla RFQ |
| **MINOR** (`1.6.2` → `1.7.0`) | Funcionalidad nueva compatible | estado `recibido`, campana, rol Compras |
| **MAJOR** (`1.x` → `2.0.0`) | Cambios incompatibles (API, BD, flujos que rompen despliegues) | reescritura de contratos |

## Checklist de release

1. **Actualizar** `backend/package.json` y las entradas de versión del paquete en `backend/package-lock.json`.
2. **Documentar** la versión en `CHANGELOG.md` (sección nueva arriba).
3. **Actualizar** la línea de versión en `README.md` y crear/actualizar `DESPLIEGUE-vX.Y.Z.md`.
4. **Commit** en `main` (o rama de release):
   ```powershell
   git add backend/package.json backend/package-lock.json CHANGELOG.md README.md DESPLIEGUE-vX.Y.Z.md
   git commit -m "release: vX.Y.Z — descripción breve"
   ```
5. **Crear tag anotado** en ese commit:
   ```powershell
   git tag -a vX.Y.Z -m "vX.Y.Z — descripción breve"
   ```
6. **Publicar** (cuando estés listo):
   ```powershell
   git push origin main
   git push origin vX.Y.Z
   ```
7. **Empaquetar deploy**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\empaquetar-deploy.ps1
   ```
8. **GitHub Release** (opcional):
   ```powershell
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "Resumen. Detalle en CHANGELOG.md."
   ```

## Tags históricos

| Tag | Notas |
|-----|--------|
| `v1.0.0` | Entrega formal |
| `v1.1.2` | Ajustes SMTP/DB |
| `v1.2.0` | Carrito, recepciones, cierre OC |
| `v1.2.1` | Correcciones menores |
| `v1.3.0` | Consecutivos, catálogo proveedor, emails |
| `v1.3.1` | Fix consecutivos |
| `v1.3.2` | Plantilla RFQ, Nº ítem OC |
| `v1.4.0` | PO/fecha_po, UDM, catálogo Excel |
| `v1.4.1` | Idioma RFQ, recibo por ítem |
| `v1.5.0` | BASE GRAL import, filtros activos |
| `v1.6.0` | Reportes unificados, EUR |
| `v1.6.1` | Email proveedor opcional; Área/Depto |
| `v1.6.2` | Cotización solo registrar sin RFQ |
| `v1.7.0` | Rol Compras, acuse `recibido`, bandeja/notificaciones |
| `v1.7.5` | Bandeja Dashboard REQ/OC, export proveedores, filtros REQ |
| `v1.8.0` | Notas REQ, reportes por periodo, control de correos, fixes fecha/catálogo |
| `v1.9.0` | Dashboard general, usuarios duplicados, proveedor en OC |
| `v1.9.1` | Purga placeholders sin-correo del import |

## Convención de mensajes de commit (recomendado)

- `feat:` nueva funcionalidad
- `fix:` corrección
- `docs:` documentación
- `chore:` mantenimiento (deps, versionado, scripts)
- `release: vX.Y.Z` — commit de corte de versión

## CI y pruebas

| Comando | Cuándo | Requiere |
|---------|--------|----------|
| `npm run test:ci` / `test:unit` | Siempre (local y GitHub Actions) | Solo Node + archivos del repo |
| `npm run test:integration` | Local / CI con MySQL | BD `*_test` |
| `npm run test:e2e` | Local o workflow `e2e.yml` (manual/nightly) | BD `*_test` + Chromium |

El workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) ejecuta `test:ci` (unitarias) en cada push/PR a `main`.

La versión en pantalla (sidebar / login) y en `GET /api/health` sale de `backend/package.json`. Si el footer muestra otra versión que el tag, el servidor no se actualizó o hay un deploy incompleto.

## Cortar versión con otro trabajo a medias (p. ej. pruebas)

Si hay cambios de tests/CI en el working tree y quieres que el **release quede antes** (historia: `vX.Y.Z` → luego la suite):

```powershell
# 1. Apartar lo que no entra en esta versión
git stash push -u -m "suite de pruebas"

# 2. Completar el checklist de release (package.json, CHANGELOG [X.Y.Z], README, DESPLIEGUE)
git add backend/package.json backend/package-lock.json CHANGELOG.md README.md DESPLIEGUE-vX.Y.Z.md VERSIONING.md
git commit -m "release: vX.Y.Z — descripción breve"
git tag -a vX.Y.Z -m "vX.Y.Z — descripción breve"

# 3. Recuperar el trabajo posterior encima del tag
git stash pop
```

En `CHANGELOG.md`, lo recuperado debe quedar en **`[Unreleased]`**, no dentro de `[X.Y.Z]`.

La siguiente versión (p. ej. `1.7.6` o `1.8.0`) se corta cuando la suite ya esté lista, con el mismo checklist.

## Qué no hacer

- No reescribir tags ya publicados en `origin` (`git tag -f` + force-push) salvo acuerdo explícito.
- No dejar la versión solo en el mensaje de commit: debe estar en `package.json` + tag.
- No subir `node_modules`, `.env` ni ZIPs de deploy al repositorio.
