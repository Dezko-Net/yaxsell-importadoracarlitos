# Yaxsell — Importadora Carlitos (Firebase)

Este repositorio contiene la tienda online, administración, POS, ERP/inventario y el módulo de tiendas aliadas de Yaxsell.

La documentación técnica vigente para continuar el proyecto está en [documentacion/README.md](documentacion/README.md). Empieza por la [guía para IA](documentacion/GUIA_PARA_IA.md) y revisa las [alertas de seguridad](documentacion/INVENTARIO_SEGURIDAD_Y_HISTORICO.md) antes de operar.

Stack principal: Next.js 15, React 19, TypeScript, Firebase/Firestore, Firebase Auth y Storage. El repositorio conserva código de compatibilidad y documentación antigua de Appwrite; no asumir que esos apuntes describen la configuración actual.

**Alerta de seguridad:** las reglas locales de Firestore y Storage permiten acceso público de lectura/escritura. El estado desplegado no fue consultado; confirma las reglas efectivas antes de manejar datos reales.
