-- Claves de acceso a la API. Solo se guarda el hash (SHA-256): la clave en sí se muestra una única vez al crearla.
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rol text not null check (rol in ('admin','operador')),
  hash text not null unique,
  activa boolean not null default true,
  creada_en timestamptz not null default now(),
  ultimo_uso timestamptz
);
