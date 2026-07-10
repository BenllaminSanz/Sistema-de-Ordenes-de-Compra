# Manual: subir cambios a GitHub

**Consulta este documento cada vez que quieras guardar o publicar trabajo en el repositorio.**

Está pensado para el **Sistema de Órdenes de Compra**, pero el mismo método sirve en proyectos futuros.

| Documento | Para qué |
|-----------|----------|
| **Este manual** | Qué hacer al terminar de programar (push diario o release) |
| [VERSIONING.md](../VERSIONING.md) | Detalle de números SemVer, tags y Releases |
| [CHANGELOG.md](../CHANGELOG.md) | Historial de lo que cambió en cada versión |

**Repo:** https://github.com/BenllaminSanz/Sistema-de-Ordenes-de-Compra  

**Comandos:** pensados para **PowerShell** en Windows, desde la carpeta raíz del proyecto:

```text
D:\Documents\Proyectos de Trabajo\Sistema de Ordenes de Compra
```

---

## 1. Primero decide: ¿solo guardar o hacer una versión?

| Situación | Qué es | Qué haces |
|-----------|--------|-----------|
| Terminé un arreglo o avance del día | **Push normal** | Commit + `git push` (sección 2) |
| Esto ya se puede **desplegar / entregar** al cliente o a planta | **Release** | Versión + CHANGELOG + tag + push (sección 3) |
| Solo quiero ver si algo se rompió | **CI local** | `npm run test:ci` en `backend/` |

**Regla simple:**  
- Casi todos los días → **push normal**.  
- Solo cuando “esto es lo que va a producción / es entrega” → **release**.

No crees un tag por cada commit pequeño.

---

## 2. Checklist: subir cambios del día (push normal)

Úsalo cuando hayas tocado código y quieras subirlo a GitHub **sin** cambiar el número de versión.

### 2.1 Antes de commitear

```powershell
# 1. Ver en qué carpeta estás y el estado
cd "D:\Documents\Proyectos de Trabajo\Sistema de Ordenes de Compra"
git status

# 2. (Recomendado) Comprobaciones rápidas sin MySQL
cd backend
npm run test:ci
cd ..
```

- [ ] `git status` muestra solo archivos que **tú** modificaste (nada de `.env`, `node_modules`, zips de deploy).
- [ ] Si tocaste backend o estructura del proyecto, `npm run test:ci` terminó en verde.

### 2.2 Revisar el diff (opcional pero útil)

```powershell
git diff
# o solo nombres de archivos:
git diff --stat
```

- [ ] No hay contraseñas, tokens ni datos reales de clientes.
- [ ] No estás subiendo `uploads/` con PDFs o archivos de prueba pesados.

### 2.3 Añadir archivos y crear el commit

```powershell
# Añadir todo lo relevante (revisa antes con git status)
git add .

# O añadir archivo por archivo si prefieres control fino:
# git add backend/src/controllers/ordenesController.js
# git add frontend/js/pages/ordenes.js

git commit -m "descripción clara de lo que hiciste"
```

**Buenos mensajes de commit** (ejemplos):

| Tipo | Ejemplo |
|------|---------|
| Función nueva | `feat: búsqueda de proveedor por código en catálogo` |
| Corrección | `fix: no permitir guardar REQ sin ítems` |
| Docs | `docs: actualizar manual de operaciones` |
| Mantenimiento | `chore: actualizar dependencias del backend` |
| Estilo / UI | `style: alinear botones del detalle de REQ` |

**Malos mensajes** (evítalos): `cambios`, `fix`, `update`, `asdf`, `.`

- [ ] El mensaje describe el cambio en una línea, en presente o pasado claro.

### 2.4 Subir a GitHub

```powershell
git push origin main
```

- [ ] El comando terminó sin error.
- [ ] (Opcional) En GitHub → pestaña **Actions**: el workflow **CI** quedó en verde.

### 2.5 Si `git push` falla

| Mensaje / situación | Qué hacer |
|---------------------|-----------|
| *Your branch is behind* / rechazado | `git pull origin main` (resuelve conflictos si hay), luego otra vez `git push` |
| Pide usuario/contraseña y falla | Usa un **Personal Access Token** o Git Credential Manager; no uses la contraseña de la cuenta web a ciegas |
| *Everything up-to-date* | No había commits nuevos; primero haz `git commit` |
| Conflictos al hacer pull | Abre los archivos marcados, deja el código correcto, `git add` esos archivos, `git commit`, luego `git push` |

---

## 3. Checklist: crear una versión (release)

Úsalo cuando el sistema **ya se puede instalar o entregar** (planta, cliente, “versión oficial”).

Detalle teórico: [VERSIONING.md](../VERSIONING.md).

### 3.1 Elegir el número (SemVer)

Versión actual de la app: mira `backend/package.json` → `"version"`.

| Cambio | Cómo sube | Ejemplo |
|--------|-----------|---------|
| Bug o ajuste pequeño | **PATCH** | `1.3.2` → `1.3.3` |
| Función nueva compatible | **MINOR** | `1.3.2` → `1.4.0` |
| Rompe compatibilidad (API, BD, flujos) | **MAJOR** | `1.3.2` → `2.0.0` |

Si dudas entre patch y minor → **patch**.

Anota aquí mentalmente: **nueva versión = `X.Y.Z`**.

### 3.2 Actualizar archivos de versión

1. **`backend/package.json`**  
   - Cambia `"version": "X.Y.Z"`.

2. **`backend/package-lock.json`**  
   - Las **dos** apariciones de la versión del proyecto (arriba y en `packages.""`) deben ser `X.Y.Z`.

3. **`CHANGELOG.md`**  
   - Mueve lo de `## [Unreleased]` a una sección nueva arriba:
   ```markdown
   ## [X.Y.Z] — AAAA-MM-DD

   ### Añadido
   - ...
   ### Corregido
   - ...
   ```
   - Deja `## [Unreleased]` vacío (o solo el título) para lo que venga después.
   - Actualiza los enlaces `compare` al final del archivo si los usas.

4. **`README.md`**  
   - Actualiza la línea **Versión X.Y.Z** y, si aplica, un bloque breve de “Novedades”.

- [ ] Los tres sitios de número (`package.json`, lock, README) coinciden.
- [ ] El CHANGELOG describe el release en lenguaje humano.

### 3.3 Probar antes del tag

```powershell
cd backend
npm run test:ci
# Si tienes servidor + MySQL + .env de prueba:
# npm test
cd ..
```

- [ ] `test:ci` en verde.

### 3.4 Commit de release

```powershell
git add backend/package.json backend/package-lock.json CHANGELOG.md README.md
# añade también el código del release si aún no está commiteado:
git add .
git status
git commit -m "release: vX.Y.Z — descripción breve"
```

### 3.5 Tag anotado

```powershell
git tag -a vX.Y.Z -m "vX.Y.Z — descripción breve"
```

Comprobar:

```powershell
git tag -l -n1
git show vX.Y.Z --no-patch
```

- [ ] Existe el tag `vX.Y.Z` y apunta al commit de release.

### 3.6 Publicar en GitHub

```powershell
git push origin main
git push origin vX.Y.Z
```

O todos los tags de una vez (solo si sabes que no hay tags locales basura):

```powershell
git push origin --tags
```

### 3.7 Release en la web (recomendado)

Con [GitHub CLI](https://cli.github.com/) autenticado (`gh auth login`):

```powershell
gh release create vX.Y.Z --title "vX.Y.Z — título corto" --notes "Resumen. Detalle en CHANGELOG.md."
```

O a mano: GitHub → **Releases** → **Draft a new release** → elige el tag `vX.Y.Z` → pega el bloque del CHANGELOG → **Publish**.

- [ ] Aparece en https://github.com/BenllaminSanz/Sistema-de-Ordenes-de-Compra/releases

### 3.8 Después de desplegar en el servidor

1. Empaquetar / copiar según el README (`empaquetar-deploy.ps1`, etc.).
2. Verificar:

   ```text
   GET http://tu-servidor/api/health
   ```

   Debe devolver `"version": "X.Y.Z"`.

3. En login o sidebar debe verse **`vX.Y.Z`**.

- [ ] La versión en pantalla = tag del release = `package.json`.

Si no coinciden: el servidor tiene código viejo o no se reinició el proceso Node.

---

## 4. Comandos de consulta rápida

Cópialos cuando solo quieras **mirar**, no cambiar nada.

```powershell
cd "D:\Documents\Proyectos de Trabajo\Sistema de Ordenes de Compra"

git status                 # ¿Hay cambios sin guardar?
git log --oneline -10      # Últimos commits
git tag -l                 # Tags locales
git remote -v              # URL del repo
git branch                 # Rama actual (debe ser main)

# Comparar con GitHub
git fetch origin
git log HEAD..origin/main --oneline   # commits en remoto que no tienes
git log origin/main..HEAD --oneline   # commits tuyos sin subir
```

Versión actual del proyecto:

```powershell
# En backend/package.json, campo "version"
Select-String -Path backend\package.json -Pattern '"version"'
```

---

## 5. Qué no subir nunca

| No subir | Por qué |
|----------|---------|
| `.env` | Secretos (BD, JWT, SMTP) |
| `node_modules/` | Se reinstala con `npm install` |
| Zips de deploy / respaldos | Pesados y a veces con datos |
| Contenido real de `backend/uploads/` | Archivos de usuarios/producción |
| Contraseñas en el código o en el commit | Seguridad |

El archivo `.gitignore` del proyecto ya cubre la mayoría. Si `git status` muestra algo sensible → **no hagas `git add` de eso**.

---

## 6. Flujo visual (resumen)

```text
  Programar
      │
      ▼
  ¿Es entrega / deploy?
      │
      ├─ NO ──► test:ci (opcional) → commit → push → (CI en GitHub)
      │
      └─ SÍ ──► elegir X.Y.Z → package.json + lock + CHANGELOG + README
                    → test:ci → commit release → tag vX.Y.Z
                    → push main + tag → Release en GitHub
                    → desplegar → verificar /api/health y UI
```

---

## 7. Problemas frecuentes

### “Hice commit pero no se ve en GitHub”
Falta el push:

```powershell
git push origin main
```

### “Subí un archivo por error”
Si **aún no** hiciste push:

```powershell
git rm --cached ruta/al/archivo
# asegúrate de que esté en .gitignore
git commit -m "chore: quitar archivo subido por error"
```

Si **ya** hiciste push de un secreto: cámbialo en el servicio (password/token nuevo), quítalo del repo y considera el secreto comprometido. No basta con “borrarlo en un commit nuevo” para tokens ya expuestos.

### “El CI falló en Actions”
1. Abre el run en rojo en GitHub → **Actions**.  
2. Lee el paso que falló (casi siempre `npm run test:ci`).  
3. En local:

```powershell
cd backend
npm run test:ci
```

4. Corrige, commit, push otra vez.

### “No sé si prod tiene la última versión”
Mira el footer del login/sidebar o:

```text
/api/health  →  campo "version"
```

Compáralo con el último Release en GitHub.

### “Quiero deshacer el último commit (sin push)”
Solo si **no** lo has subido:

```powershell
git reset --soft HEAD~1
# tus cambios quedan en el área de trabajo; puedes reeditar y volver a commit
```

No uses `reset --hard` ni reescribas historial de `main` si ya está en GitHub, salvo que sepas exactamente qué haces.

---

## 8. Mapa de conceptos (para no confundirte)

| Concepto | En una frase |
|----------|----------------|
| **Commit** | Foto guardada de tus archivos con un mensaje |
| **Push** | Enviar tus commits a GitHub |
| **Pull** | Traer commits de GitHub a tu PC |
| **Tag `v1.3.2`** | Marca fija: “este commit es la versión 1.3.2” |
| **Release** | Página en GitHub con notas sobre ese tag |
| **main** | Rama principal / código de referencia |
| **CI (Actions)** | Pruebas automáticas al hacer push |
| **CHANGELOG** | Lista humana de cambios por versión |

---

## 9. Plantilla mental para **otros** proyectos

Cuando empieces un repo nuevo, repite el mínimo:

1. `.gitignore` + `.env.example` + README  
2. Número de versión en el `package.json` (o equivalente)  
3. `CHANGELOG.md` desde el primer release  
4. Push frecuente; **tag solo en entregas**  
5. Cuando madure: CI simple + versión visible en la app  

El ritual de la **sección 2** y la **sección 3** de este manual se reutiliza casi igual.

---

## 10. Lista de una sola página (imprimible)

### Push del día
1. `git status`  
2. `cd backend` → `npm run test:ci` → `cd ..`  
3. `git add .`  
4. `git commit -m "mensaje claro"`  
5. `git push origin main`  
6. Mirar Actions en verde (opcional)

### Release
1. Elegir `X.Y.Z`  
2. `package.json` + `package-lock` + `CHANGELOG` + `README`  
3. `npm run test:ci`  
4. `git commit -m "release: vX.Y.Z — …"`  
5. `git tag -a vX.Y.Z -m "…"`  
6. `git push origin main` + `git push origin vX.Y.Z`  
7. Crear Release en GitHub  
8. Desplegar y verificar `/api/health` y UI = `X.Y.Z`

---

*Última actualización del manual: alineada al flujo con versión en health/UI, `test:ci` y tags SemVer del Sistema OC.*
