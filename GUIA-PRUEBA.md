# Guía de prueba de punta a punta — EL&ectricidad API

Orden recomendado: **primero local sin WhatsApp (Fase 1), luego Railway (Fase 2), luego WhatsApp (Fases 3 y 4)**. Si algo falla, sabrás en qué capa está el problema. Los nombres de los menús de Railway y Meta pueden variar un poco; si alguno no coincide, busca el equivalente.

## Fase 0 — Qué necesitas
- Node.js 22 o superior, Git y una cuenta de GitHub.
- Docker (solo para la prueba local; si no lo tienes, usa la base de Railway de la Fase 2 y salta la 1).
- Cuenta de Railway.
- Tu app de Meta con WhatsApp Business API y un número de prueba o verificado.
- Una clave de API de Anthropic (console.anthropic.com). **Pon allí un límite de gasto mensual** antes de empezar.

---

## Fase 1 — Prueba local (sin WhatsApp)

### 1. Base de datos y variables
```
docker run --name pg-electricidad -e POSTGRES_PASSWORD=clave -e POSTGRES_DB=electricidad -p 5432:5432 -d postgres:16
```
Descomprime el proyecto, entra a la carpeta y crea el archivo `.env` (copia de `.env.example`) con al menos:
```
PORT=3000
DATABASE_URL=postgres://postgres:clave@localhost:5432/electricidad
CLAVE_ADMIN_INICIAL=una-clave-larga-de-prueba-de-al-menos-32-caracteres
```
Deja vacías las variables de WhatsApp: el agente queda apagado y es lo esperado.

### 2. Compilar, migrar y arrancar
```
npm install
npm run build
node --env-file=.env dist/shared/db/migrate.js
node --env-file=.env dist/main.js
```
**Esperado:** la migración imprime 6 líneas `migración aplicada: 000X_...`, y el servidor queda escuchando en el puerto 3000. También verás avisos de que el agente de WhatsApp y el envío de avisos están desactivados.

### 3. Recorrido por la API
En otra terminal (en Windows usa Git Bash o WSL):
```
export URL=http://localhost:3000
export KEY=una-clave-larga-de-prueba-de-al-menos-32-caracteres
export H1="Authorization: Bearer $KEY"
export H2="content-type: application/json"
```

**Seguridad**
```
curl $URL/health                      # 200 {"status":"ok"}
curl $URL/clientes                    # 401 (sin clave)
curl -H "$H1" $URL/health/db          # 200 con datos del pool
```

**Catálogo, cliente e instalación** (copia cada `id` que devuelva; el valor de las variables lo pegas tú)
```
curl -X POST $URL/instalaciones/catalogo-equipos -H "$H1" -H "$H2" \
  -d '{"marca":"MarcaDemo","modelo":"Kit 2000","tipo":"kit","precioReferenciaUsd":2000}'

curl -X POST $URL/clientes -H "$H1" -H "$H2" \
  -d '{"nombre":"Cliente Prueba","telefonoWhatsapp":"TU_NUMERO_CON_CODIGO_DE_PAIS","vip":true,"notificar":false}'

curl -X POST $URL/instalaciones -H "$H1" -H "$H2" \
  -d '{"clienteId":"ID_CLIENTE","direccion":"Calle de prueba","equipos":[{"catalogoEquipoId":"ID_EQUIPO","cantidad":5}]}'
```
**Esperado:** la instalación devuelve `"valorEquiposUsd": 10000`.

**Cotización** (el cliente es VIP, así que se incluye el recargo)
```
curl -X POST $URL/cotizaciones -H "$H1" -H "$H2" -d '{"instalacionId":"ID_INSTALACION"}'
```
**Esperado:** asesoría 15, mantenimiento 300, mano de obra 2000, monitoreo 200, atención VIP 150, **total 2665**.

Ahora regístrala de verdad:
```
curl -X POST $URL/cotizaciones -H "$H1" -H "$H2" -d '{"instalacionId":"ID_INSTALACION","crearServicios":true}'
```
Copia el `id` del servicio de monitoreo (`ID_SERVICIO`).

**Pagos**
```
curl -X POST $URL/pagos -H "$H1" -H "$H2" -d '{"servicioId":"ID_SERVICIO","montoUsd":50,"metodo":"efectivo"}'
curl -X POST $URL/pagos -H "$H1" -H "$H2" -d '{"servicioId":"ID_SERVICIO","montoUsd":500,"metodo":"efectivo"}'
curl -H "$H1" $URL/instalaciones/ID_INSTALACION/servicios
```
**Esperado:** el primero se registra (201); el segundo se rechaza con un mensaje de que supera lo que falta (422); en la lista, el monitoreo muestra `pagadoUsd: 50`.

Con pasarela manual:
```
curl -X POST $URL/pagos/cobros -H "$H1" -H "$H2" -d '{"servicioId":"ID_SERVICIO"}'     # cobra lo que falta (150), queda pendiente
curl -X POST $URL/pagos/ID_PAGO/confirmar -H "$H1"
```
Luego el servicio debe mostrar `pagadoUsd: 200`.

**Estado y conformidad**
```
curl -X PUT $URL/instalaciones/servicios/ID_SERVICIO/estado -H "$H1" -H "$H2" -d '{"estado":"completado","notificar":false}'
curl -X PUT $URL/instalaciones/servicios/ID_SERVICIO/conformidad -H "$H1" -H "$H2" -d '{"estado":"conforme","comentario":"Todo bien"}'
```

**Roles**
```
curl -X POST $URL/claves -H "$H1" -H "$H2" -d '{"nombre":"Prueba operador","rol":"operador"}'
```
Guarda la `clave` que devuelve (solo se muestra una vez) y úsala como `Bearer`:
```
curl -X PUT $URL/cotizaciones/tarifas/monitoreo -H "Authorization: Bearer CLAVE_OPERADOR" -H "$H2" -d '{"valor":3}'
```
**Esperado:** 403 (solo admin cambia tarifas). Con tu clave admin sí funciona; vuelve a poner `2` después.

Si todo esto da lo esperado, la lógica de negocio funciona con base de datos real.

---

## Fase 2 — Despliegue en Railway

1. Sube el proyecto a un repositorio **privado** de GitHub (el `.gitignore` ya excluye `.env`).
2. En Railway: nuevo proyecto → desplegar desde ese repositorio. Agrega una base de datos PostgreSQL al mismo proyecto.
3. En las variables del servicio de la app:
   - `DATABASE_URL`: referencia a la variable de la base de datos de Railway (la conexión interna).
   - `CLAVE_ADMIN_INICIAL`: una clave **nueva y larga** (`openssl rand -base64 32`), distinta a la de prueba.
4. Genera un dominio público para el servicio.
5. Revisa los logs del despliegue: deben verse las migraciones aplicadas y el servidor escuchando. `railway.json` ya configura el build, las migraciones al arrancar y el chequeo `/health`.
6. Prueba `https://TU-APP/health` y repite un par de llamadas de la Fase 1 contra esa URL.

---

## Fase 3 — Agente de WhatsApp

### 1. Variables en Railway
| Variable | De dónde sale |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Un texto cualquiera que inventes |
| `WHATSAPP_APP_SECRET` | Tu app de Meta → Configuración → Básica → Clave secreta |
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso. El temporal caduca en horas; para uso real crea un token permanente con un usuario del sistema |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → Configuración de la API (es el ID del número, no el teléfono) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |

Guarda y espera a que se redespliegue. En los logs ya no debe aparecer "agente desactivado".

### 2. Conectar el webhook en Meta
En WhatsApp → Configuración → Webhook:
- URL de devolución de llamada: `https://TU-APP/whatsapp/webhook`
- Token de verificación: el mismo de `WHATSAPP_VERIFY_TOKEN`
- Verifica y guarda; luego **suscríbete al campo `messages`**.

Si la verificación falla: token distinto (error 403), app caída o URL mal escrita.

### 3. Registrarte como cliente y escribir
Crea un cliente con **tu número de WhatsApp** (solo dígitos, con código de país) y `"notificar": false`. Si usas un número de prueba de Meta, tu teléfono debe estar en la lista de destinatarios permitidos.

Desde tu teléfono escribe al número de la empresa, por ejemplo: *"Hola, ¿cuánto cuesta el monitoreo?"*

**Esperado (en unos 5 segundos):** una respuesta breve en español con las tarifas de referencia. Prueba también *"¿cómo van mis pagos?"* y comprueba que cita tus servicios y saldos. Pregunta algo que no esté en los datos y verifica que lo reconoce en vez de inventar.

### 4. Si no responde, mira los logs en este orden
- No aparece ninguna petición al webhook → el webhook o la suscripción a `messages` no están bien.
- `Firma inválida` / 401 → `WHATSAPP_APP_SECRET` incorrecto.
- `Claude API 401` → clave de Anthropic incorrecta. `Claude API 404` → nombre de modelo inválido: define `ANTHROPIC_MODEL` con uno que tu cuenta tenga disponible.
- `WhatsApp API 401/400` → token vencido o `PHONE_NUMBER_ID` incorrecto, o el destinatario no está permitido.
- `fallo al responder por WhatsApp` → el sistema reintenta hasta 3 veces; después el mensaje queda en estado `error`.

---

## Fase 4 — Avisos automáticos

1. **Dentro de las 24 h** (acabas de escribir): crea otro cliente con tu número y `"notificar": true` → debe llegar la bienvenida como texto libre. Registra y confirma un pago → debe llegar el recibo con el saldo.
2. `curl -H "$H1" $URL/notificaciones` muestra el estado de cada aviso (`enviada`, `pendiente`, `error`).
3. **Fuera de las 24 h** (no escribas durante un día y repite): sin plantilla configurada, el aviso queda en `error` con el motivo. Crea las 3 plantillas del README en Meta, espera su aprobación, pon sus nombres en `WHATSAPP_PLANTILLA_*` y usa `POST /notificaciones/ID/reintentar`.

---

## Antes de usarlo con clientes reales
- [ ] Quitar `CLAVE_ADMIN_INICIAL` cuando ya existan claves individuales.
- [ ] Token de WhatsApp **permanente** y límite de gasto puesto en Anthropic.
- [ ] Plantillas de WhatsApp aprobadas.
- [ ] Copias de seguridad de la base de datos (revisa qué incluye tu plan de Railway o exporta con `pg_dump` de forma periódica).
- [ ] Una clave distinta por persona o aplicación.
- [ ] Revisar con el equipo qué responde el agente en 10 conversaciones reales antes de promoverlo.
