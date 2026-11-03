# CRM Servicio Técnico

CRM independiente para la gestión de avisos de reparación. Usa un proyecto Supabase separado del CRM Globaltec Marketing.

## Publicación
GitHub Actions publica `dist/` en GitHub Pages al actualizar `main`.

## Backend
El esquema está en `supabase/migrations/`. Las funciones Edge reciben formularios públicos mediante `service-form` y envían invitaciones y notificaciones.

La aplicación usa una clave publishable en `dist/supabase-config.js`. Esta clave es pública y la base de datos aplica políticas RLS por empresa. No guardes claves de servicio en los archivos del navegador.

## Integraciones
Cada empresa configura sus landings, tarifas y campos. Telegram y correo se guardan cifrados desde funciones Edge; el correo usa Resend y requiere una clave y remitente verificado.
