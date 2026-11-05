# 📊 Appwrite — Cómo Ver las Lecturas Diarias de Base de Datos

> **⚠️ IMPORTANTE para IAs:** Este proyecto tiene un límite crítico de **6,000 lecturas diarias** en Appwrite.
> Un pico de lecturas destruyó el presupuesto el 23 de junio de 2026 (de 6K a 480K lecturas/día).
> Lee el archivo `.agents/AGENTS.md` para entender las reglas de caché antes de tocar cualquier cosa.

---

## 🔗 Panel de Administración de Lecturas (Producción)

Accede al panel de IA/Appwrite directamente desde aquí:

> **[https://www.donbalatomayorista.cl/admin/ia/appwrite](https://www.donbalatomayorista.cl/admin/ia/appwrite)**
>
> _(Panel de IA con métricas de Appwrite en tiempo real — requiere sesión admin)_

**Dominios verificados en Vercel:**
| Dominio | Tipo |
|---------|------|
| `www.donbalatomayorista.cl` | 🌐 **Producción principal** |
| `donbalatomayorista.cl` | Redirige → www |
| `don-balato-ivan-nine.vercel.app` | Vercel interno |

**Vercel Project ID:** `prj_sLuSwW3hUXIW9zTrXi5EN0AgqdW7`

---

## 🖥️ Cómo consultar las lecturas via CLI de Appwrite

### 1. Instalar el CLI (si no está instalado)
```bash
npm install -g appwrite-cli
```

### 2. Configurar el cliente con las credenciales del proyecto
```bash
appwrite client \
  --endpoint "https://nyc.cloud.appwrite.io/v1" \
  --project-id "donbalatoivan" \
  --key "APPWRITE_API_KEY_AQUI"
```

> La API key está en `.env.local` → variable `APPWRITE_API_KEY`

### 3. Ver las lecturas de los últimos días (por día)
```bash
appwrite project get-usage --start-date "2026-07-01" --end-date "2026-08-04" --period "1d"
```

Cambia las fechas según lo que necesites consultar.

### 4. Filtrar solo la sección `databasesReads` en PowerShell
```powershell
$out = appwrite project get-usage --start-date "2026-07-20" --end-date "2026-08-04" --period "1d" 2>&1
$capture = $false
$out | ForEach-Object {
    if ($_ -match "databasesReads \(") { $capture = $true }
    if ($capture) { $_ }
    if ($capture -and $_ -match "^\s*$") { $capture = $false }
} | Select-Object -First 40
```

---

## 📈 Historial de lecturas (referencia)

| Fecha      | Lecturas   | Estado           |
|------------|------------|------------------|
| 2026-07-24 | 17,882     | ⚠️ Elevado       |
| 2026-07-25 | 70,018     | 🔴 Alto          |
| 2026-07-26 | 27,969     | ⚠️ Elevado       |
| 2026-07-27 | 69,124     | 🔴 Alto          |
| 2026-07-28 | **143,123**| 🚨 **PICO MÁX**  |
| 2026-07-29 | 57,019     | 🔴 Alto          |
| 2026-07-30 | 25,541     | ⚠️ Elevado       |
| 2026-07-31 | 25,129     | ⚠️ Elevado       |
| 2026-08-01 | 13,025     | 🟡 Moderado      |
| 2026-08-02 | 7,702      | 🟡 Moderado      |
| 2026-08-03 | 13,308     | 🟡 Moderado      |
| **Total**  | **~478K**  | 🚨 Semana crítica|

**Meta:** Mantener por debajo de **6,000 lecturas/día**.

---

## 🔑 Datos del Proyecto Appwrite

| Variable                  | Valor                        |
|---------------------------|------------------------------|
| Endpoint                  | `https://nyc.cloud.appwrite.io/v1` |
| Project ID                | `donbalatoivan`              |
| Database ID               | `6a62e7440033d2278d28`       |
| API Key (env var)         | `APPWRITE_API_KEY` en `.env.local` |

---

## ⚠️ Reglas de oro para IAs (resumen de AGENTS.md)

1. **Caché home = 86400 segundos (24h) siempre.** No lo toques.
2. **Nunca** uses `databases.listDocuments` sin caché en rutas de alto tráfico.
3. **Nunca** pongas `serverListDocuments` dentro de loops de webhooks de WhatsApp.
4. **Límite de productos:** máximo `Query.limit(80)` en la home.
5. **Sin polling automático** (`setInterval`, SWR) en páginas públicas.
