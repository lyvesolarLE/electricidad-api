# EL&ectricidad API

Monolito modular (Node.js + Fastify + PostgreSQL) para asesoría, mantenimiento y monitoreo fotovoltaico.

## Estructura
- `src/modules/clientes|instalaciones|cotizaciones|pagos`: módulos de negocio estable, con `dominio/`, `puertos/` y `adaptadores/` (arquitectura hexagonal).
- `src/modules/whatsapp|notificaciones`: módulos que cambian seguido, en capas simples.
- `src/shared`: configuración y base de datos.
- `migrations/`: archivos `.sql` numerados (`0001_nombre.sql`), se aplican en orden.

## Uso local
1. `cp .env.example .env` y ajusta `DATABASE_URL`.
2. `npm install`
3. `npm run build && npm run migrate`
4. `npm run dev` y abre `http://localhost:3000/health`

## Railway
Crea un proyecto con la app y PostgreSQL, enlaza `DATABASE_URL` desde el servicio de base de datos. `railway.json` ya define build, migraciones al arrancar y el chequeo `/health`.

## Medición desde el día uno
- Errores y tiempos de respuesta: logs de Fastify (se ven en Railway).
- Uso de la base de datos: `GET /health/db` muestra conexiones totales, libres y en espera.

## Paso 2: registro (clientes, instalaciones, pagos, conformidad)
- `POST/GET /clientes`, `GET /clientes/:id`
- `POST/GET /instalaciones/catalogo-equipos` (precios de referencia = valor de mercado)
- `POST /instalaciones` (con equipos), `GET /instalaciones/:id` (incluye `valorEquiposUsd`)
- `POST/GET /instalaciones/:id/servicios` (devuelve `pagadoUsd` y `conformidad`)
- `PUT /instalaciones/servicios/:servicioId/conformidad` (`pendiente`, `conforme`, `no_conforme`)
- `POST /pagos`, `GET /pagos?servicioId=...` (registro de pagos realizados)

## Paso 3: cotizaciones
- `GET /cotizaciones/tarifas`, `PUT /cotizaciones/tarifas/:concepto` (porcentajes y monto de asesoría, editables sin tocar código)
- `POST /cotizaciones` con `{ "instalacionId": "...", "vip": true, "crearServicios": true }`
  - Asesoría: monto fijo. Mantenimiento, mano de obra y monitoreo: % del valor de los equipos.
  - Atención VIP: un recargo único del 1,5 % del valor de los equipos por cotización (si no se indica `vip`, se toma el del cliente).
  - Si el cliente no instaló con la empresa, o un equipo no tiene precio propio, se usa el precio de referencia del catálogo.
- `npm test` ejecuta las pruebas de las reglas de cálculo.

## Paso 4: pagos
- `POST /pagos`: registra un pago ya recibido (queda `confirmado`).
- `POST /pagos/cobros`: inicia un cobro con la pasarela configurada (`PASARELA_PAGO`, por defecto `manual`); queda `pendiente`. Sin `montoUsd`, cobra lo que falta del servicio.
- `POST /pagos/:id/confirmar` y `POST /pagos/:id/rechazar`.
- Regla: un pago no puede superar lo que falta por pagar. Solo los pagos `confirmado` cuentan en `pagadoUsd`.
- Para conectar EnZona, Transfermóvil u otra pasarela: crear su adaptador en `src/modules/pagos/adaptadores/` (implementa `PasarelaPago`) y registrarlo en `pasarelas.ts`.

## Paso 5: agente de WhatsApp
Flujo: Meta envía el mensaje a `POST /whatsapp/webhook` → se valida la firma y se guarda en la cola (`whatsapp_mensajes`) → un worker (cada 2 s) arma el contexto del cliente, llama a Claude y responde por la API de WhatsApp. Los reintentos de Meta no duplican mensajes. Cada llamada externa tiene timeout (20 s IA, 10 s WhatsApp) y circuit breaker. Si falla, reintenta hasta 3 veces con espera creciente.

Configuración:
1. Define en Railway: `WHATSAPP_VERIFY_TOKEN` (texto que tú inventes), `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ANTHROPIC_API_KEY` (opcionales: `ANTHROPIC_MODEL`, `WHATSAPP_API_VERSION`).
2. En Meta for Developers, en la configuración de WhatsApp, pon como webhook `https://TU-APP/whatsapp/webhook` con el mismo token de verificación y suscríbete al campo `messages`.
3. Para que el agente reconozca a un cliente, su `telefonoWhatsapp` registrado debe coincidir en dígitos con su número de WhatsApp (con código de país).

El agente solo informa y orienta: no agenda, no cobra ni modifica datos. Si el cliente no está registrado, responde con las tarifas generales.

## Paso 6: avisos y recibos por WhatsApp
Avisos automáticos (en lugar de correo):
- **Bienvenida** al registrar un cliente (`POST /clientes`, se omite con `"notificar": false`).
- **Recibo de pago** al confirmarse un pago (con el saldo pendiente).
- **Servicio completado** con `PUT /instalaciones/servicios/:servicioId/estado` `{ "estado": "completado" }`.

Cada aviso se guarda en la bandeja (`notificaciones`) y un worker lo envía cada 3 s, con reintentos. `GET /notificaciones?estado=error` muestra los fallidos y `POST /notificaciones/:id/reintentar` los reenvía. No se duplican (un aviso por pago, por cliente y por servicio).

**Regla de WhatsApp:** solo se puede escribir texto libre a quien escribió en las últimas 24 h. Para avisar a los demás hay que usar **plantillas aprobadas por Meta**. Si el cliente no escribió en 24 h y no hay plantilla configurada, el aviso queda en `error` con ese motivo. Crea estas plantillas (categoría Utilidad, idioma `es`) en el administrador de WhatsApp y pon sus nombres en las variables `WHATSAPP_PLANTILLA_*`:

| Variable | Texto de la plantilla |
|---|---|
| `WHATSAPP_PLANTILLA_BIENVENIDA` | `Hola {{1}}, bienvenido/a a EL&ectricidad. Puedes escribirnos por aquí para consultas de asesoría, mantenimiento o monitoreo de tu sistema solar.` |
| `WHATSAPP_PLANTILLA_RECIBO_PAGO` | `Hola {{1}}, recibimos tu pago de {{2}} USD por el servicio de {{3}}. {{4}} ¡Gracias!` |
| `WHATSAPP_PLANTILLA_SERVICIO_COMPLETADO` | `Hola {{1}}, el servicio de {{2}} ya quedó completado. Cuéntanos por aquí cómo quedó todo; si tienes alguna observación, el equipo la revisa.` |

Los parámetros deben coincidir en orden con estos textos. La conformidad del cliente la registra el equipo con `PUT /instalaciones/servicios/:servicioId/conformidad`.

## Seguridad de la API
Toda ruta exige una clave: `Authorization: Bearer elk_...`. Son públicas solo `GET /health` y el webhook de WhatsApp (`/whatsapp/webhook`, que se valida con la firma de Meta). Hay un límite de 300 peticiones por minuto por IP.

**Roles:** `operador` (uso diario) y `admin` (además cambia las tarifas y gestiona claves).

**Primer arranque:**
1. Genera una clave larga (`openssl rand -base64 32`) y ponla en Railway como `CLAVE_ADMIN_INICIAL`.
2. Al arrancar, si no hay ninguna clave, se crea con ella un administrador. Úsala como `Bearer` para entrar.
3. Crea claves individuales con `POST /claves` `{ "nombre": "Lázaro", "rol": "admin" }`. La clave completa se muestra **una sola vez**; guárdala.
4. Después puedes quitar `CLAVE_ADMIN_INICIAL`. En la base solo se guarda el hash de cada clave.

`GET /claves` lista las claves (sin mostrarlas) y `DELETE /claves/:id` revoca una. No se puede revocar la última de administrador. Crea una clave distinta para cada persona o aplicación que use la API, así puedes revocar una sin afectar al resto.

Recomendado: usa siempre HTTPS (Railway lo da por defecto) y no pongas claves en código ni en repositorios.
