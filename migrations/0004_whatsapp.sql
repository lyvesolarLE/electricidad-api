-- Mensajes de WhatsApp: los entrantes funcionan además como cola de trabajo del agente.
create table whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  wa_id text unique,
  telefono text not null,
  direccion text not null check (direccion in ('entrante','saliente')),
  texto text not null,
  estado text not null check (estado in ('pendiente','procesando','respondido','error','enviado')),
  intentos integer not null default 0,
  ultimo_error text,
  proximo_intento timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index on whatsapp_mensajes (telefono, creado_en);
create index on whatsapp_mensajes (estado, proximo_intento) where direccion = 'entrante';
