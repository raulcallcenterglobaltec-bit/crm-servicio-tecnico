# Diseño de facturación, cobros y VERI*FACTU

Estado: especificación de implementación. No habilita emisión real ni altera los avisos existentes.

## Objetivo de producto

Añadir al CRM Gestión de avisos un módulo opcional por empresa que lleve el trabajo desde el aviso hasta el cobro y la documentación: presupuesto, albarán, factura, gastos y pagos. La organización toma como referencia las capturas aportadas (listas, búsqueda, filtros, fichas de cliente y plantillas), con un flujo simplificado alrededor del aviso técnico.

El módulo se habilita por empresa desde Superadministración. Por defecto queda desactivado y sus páginas, acciones y consultas no se exponen a los usuarios de esa empresa. Las empresas sin el módulo mantienen sus flujos actuales de avisos, landings, informes operativos y notificaciones.

## Integración visual con el CRM

La facturación será un espacio de trabajo propio dentro del CRM, no una colección de formularios añadidos a Avisos. En la navegación normal de la empresa habrá un acceso **Facturación**; al abrirlo se mostrará una pantalla completa con cabecera y navegación interna, respetando la empresa activa y el usuario ya autenticado. No habrá otro login ni un selector de negocios propio: el selector de empresa sigue siendo responsabilidad del panel de Superadministración.

La referencia visual y funcional son las capturas compartidas: listados compactos, búsqueda, filtros, estados visibles, acciones de crear y fichas relacionadas. Se tomará como inspiración de uso, con diseño y textos propios del CRM, sin copiar marca, datos ni contenido privado del programa mostrado.

Dentro de ese espacio:

- **Resumen:** total de trabajos, facturado, cobrado, pendiente, gastos y beneficio estimado; accesos rápidos para crear factura, contacto, gasto o presupuesto.
- **Facturas:** pestañas para emitidas, borradores y recurrentes; búsqueda por cliente/NIF/número/importe/concepto; vencimiento, estado de pago y estado de envío fiscal visibles. Rectificativas enlazadas a su factura original.
- **Presupuestos:** presupuestos, facturas proforma y albaranes; acciones para convertir documentos sin volver a escribir cliente y conceptos.
- **Gastos:** gastos propios de la empresa y gastos asociados a un aviso, con categoría, proveedor, importe, fecha y adjunto opcional. Separados de los gastos de materiales imputados a un trabajo.
- **Contactos:** clientes y proveedores, datos fiscales/comerciales, correos, dirección, condiciones y resumen de documentos/deuda. Se reutiliza la ficha del cliente del aviso, sin duplicar personas.
- **Productos y servicios:** catálogo opcional para agilizar conceptos y precios; cada factura puede añadir o editar conceptos según el trabajo realizado.
- **Cobros y pagos:** pagos del cliente por factura/trabajo, parciales o completos, método, fecha, referencia y saldo pendiente. Bancos y remesas se dejan como ampliación posterior, porque no hacen falta para el primer flujo de reparación.
- **Configuración de documentos:** datos fiscales del emisor, plantilla/logo, idioma, series, vencimientos y correo remitente, por empresa. Certificado fiscal solo en backend.

Al iniciar desde un aviso, el CRM abrirá el espacio Facturación con ese aviso y cliente ya seleccionados. Desde Facturación también se podrá trabajar sin aviso enlazado, para documentos generales. Cada fila llevará de vuelta al aviso cuando exista relación.

En móvil, el espacio usará navegación adaptable y conservará las mismas acciones principales. El formulario público y los endpoints de las landings no se mueven ni se modifican por integrar esta pantalla.

## Recorrido principal

1. Entra el aviso por formulario o se registra por teléfono; el comportamiento actual permanece intacto.
2. Cuando el trabajo sale adelante, la ficha permite completar datos de intervención y el importe.
3. Se pueden registrar presupuesto, albarán y gastos asociados. Los documentos y los pagos son entidades separadas.
4. En Cobros se registran pagos parciales o completos. El saldo se calcula desde el total facturado/trabajo y la suma de pagos.
5. La factura se crea como borrador desde el aviso, revisando cliente, conceptos, impuestos, emisor, serie, fecha y vencimiento.
6. Al emitirla, el número queda reservado de forma atómica y el documento pasa a ser inmutable. Correcciones posteriores se hacen mediante factura rectificativa, con referencia explícita a la original; nunca se borra ni se reescribe una factura emitida.
7. Desde la factura se puede descargar PDF o enviar por correo a una dirección elegida y guardar la dirección de contacto. El envío por email queda auditado por fecha, destinatario y resultado.
8. Si está habilitada la modalidad VERI*FACTU y se han completado las credenciales fiscales del emisor, el sistema transmite el registro generado y muestra estado de envío y respuesta. Errores quedan en cola reintentable sin duplicar registros.

## Configuración por empresa

Perfil de emisor:
- Tipo de emisor: persona física/autónomo o persona jurídica.
- Nombre/razón social, NIF, domicilio fiscal y datos opcionales del documento.
- Logotipo y diseño/idioma de plantilla.
- Series y reglas de numeración por ejercicio.
- Configuración fiscal editable por personal autorizado, con tipos de impuesto y exenciones según lo que confirme la gestoría de cada empresa. El CRM no debe decidir por sí mismo el tratamiento fiscal de una operación.
- Correo remitente y certificado electrónico del emisor para Verifactu, guardado solo en backend mediante almacenamiento cifrado; nunca en HTML, JavaScript público ni logs.

La habilitación funcional del módulo y la activación de emisión fiscal son controles separados. El interruptor de Superadministración decide qué empresa ve Facturación/Cobros; una configuración de emisor completa no activa por sí sola el envío a la AEAT.

## Modelo de datos propuesto

- `company_billing_profiles`: perfil fiscal y preferencias de factura por empresa.
- `customers` o perfil fiscal ligado al cliente: identidad, NIF, dirección y correos. Evitar duplicar contactos cuando un cliente tiene varios avisos.
- `quotes` / `quote_lines`: presupuestos y versiones/estados.
- `delivery_notes` / `delivery_note_lines`: albaranes y adjuntos privados opcionales.
- `invoices` / `invoice_lines`: emisor y cliente congelados al emitir, serie/número, fechas, importes, desglose fiscal, estado, factura origen en caso de rectificación, PDF y metadatos de envío.
- `invoice_sequences`: contador bloqueado transaccionalmente por empresa, serie y ejercicio.
- `notice_expenses`: gastos de materiales u otros ligados a un aviso/trabajo, con fecha, importe, nota y adjunto opcional.
- `notice_payments`: pagos parciales existentes, ligados al aviso y empresa; se conservan y se presentan junto a facturas para evitar confundir cobro con emisión.
- `sif_issuances` / auditoría de eventos: huella y datos inmutables por registro, estado/acuse AEAT, reintentos idempotentes y cadena de registros que exige la modalidad elegida.

Las tablas con datos fiscales/documentales llevan RLS estricta por `company_id`, claves foráneas compuestas para impedir cruces entre empresas y políticas de rol. Solo funciones backend pueden manejar certificados, consecutivos y operaciones de emisión. Los documentos se guardan en un bucket privado con políticas de acceso por empresa y URLs firmadas de vida corta.

## VERI*FACTU: preparación y activación

Se construye como capacidad final del producto, no como simulación que se presente a clientes como conforme. Debe incluir generación del registro de facturación según el esquema vigente, QR tributario, identificación de sistema/productor y versión, envío SOAP a AEAT con el certificado del emisor, almacenamiento de respuesta, reintentos idempotentes y tratamiento de facturas rectificativas/anulaciones.

En desarrollo, integración y QA se usan datos ficticios y el entorno/procedimiento de pruebas oficial cuando esté disponible. No se envían facturas reales durante pruebas. La opción de emisión real estará bloqueada hasta que la versión haya pasado revisión integral, estén configurados los certificados de cada emisor y el productor del software haya sido identificado y haya suscrito la declaración responsable de esa versión. La declaración se guarda/versiona y se muestra en el producto. El CRM no afirmará estar certificado sin esa revisión.

Fuentes normativas de referencia:
- AEAT, certificación mediante declaración responsable: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/cuestiones-generales/certificacion-sistemas-informaticos_.html
- AEAT, modalidades VERI*FACTU y NO VERI*FACTU: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/cuestiones-generales/modalidades-cumplimiento-obligaciones.html
- AEAT, preguntas frecuentes de sistemas VERI*FACTU: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/sistemas-verifactu.html

## Secuencia de implementación

1. Revisar y consolidar la separación actual de cobros y facturación, más el catálogo de módulos por empresa, sin fusionar cambios a producción todavía.
2. Diseñar migraciones, RLS, almacenamiento privado, integración segura y pruebas de aislamiento entre compañías.
3. Implementar contactos, perfil fiscal, gastos, presupuestos, albaranes, líneas de factura, numeración y borradores.
4. Implementar emisión inmutable, rectificativas, PDF, correo y auditoría.
5. Implementar el conector VERI*FACTU en backend, con certificados protegidos y pruebas contra el procedimiento oficial; dejarlo desactivado hasta validación legal y técnica.
6. Probar regresión de entrada de avisos y notificaciones de todas las landings existentes, más permisos, aislamiento, cálculo de pagos, numeración concurrente, documentos, emails y flujo fiscal.
7. Presentar un PR revisable y no desplegarlo en producción hasta completar esas pruebas.

## Criterios de aceptación

- Una empresa sin el módulo no ve ni puede llamar endpoints de facturación/cobros.
- Una empresa habilitada ve únicamente sus clientes, avisos, documentos, pagos, gastos y configuración.
- Un pago parcial actualiza saldo y estado sin cambiar la factura.
- La numeración no se duplica con emisiones simultáneas ni entre empresas/series/ejercicios.
- Factura emitida no se puede editar ni eliminar; la corrección genera rectificativa vinculada.
- Albarán/adjuntos no son públicos.
- PDF y correo reflejan emisor, cliente, conceptos, importes y estados guardados.
- El registro VERI*FACTU y su QR se verifican contra casos oficiales; el envío no crea duplicados tras reintentos.
- Los avisos de landings actuales siguen entrando y notificándose sin cambios de endpoint o payload.
- En el despliegue inicial del módulo, la emisión real está desactivada por defecto para todas las empresas.
