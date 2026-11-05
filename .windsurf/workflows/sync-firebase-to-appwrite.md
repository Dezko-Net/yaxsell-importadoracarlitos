---
description: Procedimiento histórico, no ejecutar sin revisar el destino y autorización actual
---

# Workflow heredado: Firebase → Appwrite

Este procedimiento data de julio de 2026 y pertenece a una integración de compatibilidad. No es parte del flujo normal de tienda Firebase y puede escribir datos en un servicio externo.

Antes de retomarlo, inspecciona el handler actual `src/app/api/admin/sync-firebase-products/route.ts`, confirma quién lo consume, revisa autorización y destino, y usa credenciales entregadas por el entorno seguro. Este archivo ya no almacena contraseñas.

No se incluyen pasos de login ni claves de ejemplo porque las credenciales no deben guardarse en workflows del repositorio. La nueva guía está en `documentacion/README.md`.
