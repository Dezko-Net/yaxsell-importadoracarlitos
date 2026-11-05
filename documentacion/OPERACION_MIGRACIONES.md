# Operación, despliegue y migraciones

## Comandos del proyecto

`package.json` declara:

```powershell
npm install
npm run dev
npm run build
npm run start
npm run lint
```

No hay comando `test` en el manifiesto revisado. Esta auditoría no ejecutó instalación, lint, build, migración ni comandos que llamen a Firebase/servicios externos.

## Variables de entorno

Configura localmente y en el proveedor de despliegue los nombres que el código espera. La lista está en [Firebase, datos y caché](FIREBASE_DATOS_Y_CACHE.md). No copiar `.env.local`, service accounts, tokens, claves privadas o archivos `*-key.json` a documentación, commits o chats. El `.gitignore` excluye `.env*` y patrones de keys, pero confirma `git status` y que no existan secretos ya rastreados.

El cliente y Admin pueden elegir una base Firebase nombrada distinta. Asegura coherencia entre `NEXT_PUBLIC_FIREBASE_DATABASE_ID`, `FIREBASE_DATABASE_ID`, `firebase.json` y el proyecto seleccionado en Vercel/Firebase Console.

## Despliegue y tareas programadas

`vercel.json` declara:

- `/api/cron/expire-orders`: cada cinco minutos.
- `/api/cron/risk-velocity`: diariamente a las 12:00 UTC.

La configuración local no confirma que esos crons estén activos en Vercel. Verifica autenticación del handler, variables, logs y entorno antes de cambiar la frecuencia o ejecutar manualmente.

`next.config.ts` externaliza `firebase-admin` y deja `images.unoptimized: true`; considera ese comportamiento en cambios de build, funciones serverless e imágenes.

## Migraciones y scripts

Hay utilidades en `migracion/`, `scripts/importacion/` y la raíz de `scripts/`. Algunas son análisis de solo lectura; otras escriben o eliminan documentos, suben/borran objetos, cambian credenciales o reproducen conciliaciones. Revisa cada script exacto antes de usarlo; el nombre `check`, `verify`, `sync` o `audit` no garantiza modo de solo lectura.

### Flujo para un script que puede escribir

1. Leer el script y las instrucciones inmediatas en su carpeta.
2. Identificar la cuenta de servicio, proyecto, base y colecciones destino sin imprimir valores secretos.
3. Revisar argumento `--apply`/`--dry-run`, lotes, condiciones de borrado y reintentos.
4. Confirmar que hay respaldo recuperable y que no se incluye información fuera del alcance pedido.
5. Ejecutar primero el modo de análisis si está implementado; comparar resultados con conteos esperados.
6. Aplicar únicamente con autorización para modificar datos y verificar el resultado en el mismo destino.

En particular, `migracion/borrar-productos.mjs`, `migracion/borrar-productos-appwrite.mjs`, herramientas `delete-*`, scripts `apply-*` y `migrate-*` pueden alterar datos. No fueron ejecutados.

### Sincronización del catálogo maestro

El archivo maestro, el script de sincronización y las columnas de precios de Importadora Carlitos están pendientes de configurar. No ejecutes cargadores heredados de otra operación sobre esta copia. Cuando se reciba el catálogo propio, confirma ruta, modo de auditoría, respaldo y significado de precios antes de aplicar cambios.

### Migración de cliente Firebase

`migracion/README.md` describe `migracion/migrar-cliente.mjs` como un asistente que cambia configuración, `.env.local` y datos semilla de Firebase. Es una guía de agosto 2026. No ejecutes esa migración sobre el checkout actual sin una copia aislada: el script está diseñado para transformar el proyecto base.

## Datos y salidas que se preservaron

- No se leyeron los logs de tracking, exports JSON de productos/ventas/clientes, bases temporales ni respaldos financieros.
- Los directorios `scripts/backups/` contienen copias identificadas por operación y fecha; se conservaron porque no son duplicados de los archivos actuales y pueden ser respaldo operativo.
- No se encontraron archivos `.zip`, `.rar`, `.7z`, `.tar` o `.gz` dentro del alcance excluyendo dependencias y cachés.
- Los tres archivos `.bak` encontrados no coinciden con su archivo fuente, por lo que se conservaron como versiones distintas.
