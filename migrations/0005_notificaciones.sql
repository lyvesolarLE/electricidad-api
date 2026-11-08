-- Bandeja de salida: los avisos se guardan aquí y un worker los envía por WhatsApp.
create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  referencia text unique,            -- evita duplicados: 'pago:<id>', 'bienvenida:<id>', 'completado:<id>'
  telefono text not null,
  tipo text not null check (tipo in ('bienvenida','recibo_pago','servicio_completado')),
  texto text not null,
  parametros jsonb not null default '[]',
  estado text not null default 'pendiente' check (estado in ('pendiente','procesando','enviada','error')),
  intentos integer not null default 0,
  ultimo_error text,
  proximo_intento timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index on notificaciones (estado, proximo_intento);
