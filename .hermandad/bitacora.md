# Bitácora de Actividad — PROJECT YAXSEL (PRODUCCION) - 14-06-2026 (3GB)

*Historial compacto de decisiones y tareas de La Hermandad.*

---
### [2026-07-27] Bautismo e Inicialización
- Se creó la memoria atada a disco `.hermandad/`.
- Identidad inicial registrada correctamente.

- [2026-07-27] Chat móvil: Petición automática de Jan: quiere VER este proyecto en vivo desde su teléfono. ...
- [2026-07-27] Chat móvil: Petición automática de Jan: quiere VER este proyecto en vivo desde su teléfono. ...
### [2026-10-22] Handoff técnico — PROJECTO YAXSELL IMPORTADORA CARLITOS (FIREBASE)
- Se creó `documentacion/` con nueve documentos, incluido inventario de 168 páginas y 156 endpoints API; cubren arquitectura, Firebase/cache, POS/ERP, tienda/vendors, API/integraciones, operación, inventario y riesgos.
- Se reemplazó el README raíz; se actualizaron los puntos de entrada de instrucciones. Se eliminaron 17 copias Markdown exactas dentro de `DOCUMENTOS/`, conservando originales canónicos.
- Se retiró una contraseña literal del workflow antiguo Firebase→Appwrite y se dejó rotulado como legado.
- Hallazgos locales críticos: rules Firestore/Storage abiertas; fallback literal en secreto HMAC de vendor; endpoint público consulta pedido por folio y devuelve el documento completo. No se accedió a Firebase Console ni se alteraron reglas/datos.
- Sin archivos comprimidos detectados. Se preservaron tres `.bak` distintos de sus fuentes, `scripts/backups/`, logs/dumps, archivos de credenciales y los cambios previos del usuario en POS/PDF.
- No se revisó la planilla externa de inventario. No se ejecutaron tests, build, lint, importaciones ni migraciones. Se comprobaron enlaces relativos y patrones de secretos en docs nuevas.
- Alcance limitado a este proyecto, la memoria NEXO y esta bitácora.


