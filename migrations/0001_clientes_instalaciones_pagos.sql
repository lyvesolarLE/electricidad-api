create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono_whatsapp text not null unique,
  email text,
  direccion text,
  vip boolean not null default false,
  creado_en timestamptz not null default now()
);

create table catalogo_equipos (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  modelo text not null,
  tipo text not null,
  potencia_w integer,
  precio_referencia_usd numeric(12,2) not null check (precio_referencia_usd >= 0),
  actualizado_en timestamptz not null default now(),
  unique (marca, modelo)
);

create table instalaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  direccion text,
  instalada_por_empresa boolean not null default true,
  fecha_instalacion date,
  creada_en timestamptz not null default now()
);

-- Si precio_unitario_usd es null, se usa el precio de referencia del catálogo (valor de mercado).
create table instalacion_equipos (
  id uuid primary key default gen_random_uuid(),
  instalacion_id uuid not null references instalaciones(id) on delete cascade,
  catalogo_equipo_id uuid not null references catalogo_equipos(id),
  cantidad integer not null check (cantidad > 0),
  precio_unitario_usd numeric(12,2) check (precio_unitario_usd >= 0)
);

create table servicios (
  id uuid primary key default gen_random_uuid(),
  instalacion_id uuid not null references instalaciones(id),
  tipo text not null check (tipo in ('asesoria','mantenimiento','mano_de_obra','monitoreo')),
  monto_usd numeric(12,2) not null check (monto_usd >= 0),
  vip boolean not null default false,
  estado text not null default 'cotizado' check (estado in ('cotizado','aceptado','en_curso','completado','cancelado')),
  creado_en timestamptz not null default now()
);

create table pagos (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios(id),
  monto_usd numeric(12,2) not null check (monto_usd > 0),
  metodo text not null,
  referencia text,
  pagado_en timestamptz not null default now()
);

create table conformidades (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null unique references servicios(id),
  estado text not null check (estado in ('pendiente','conforme','no_conforme')),
  comentario text,
  registrada_en timestamptz not null default now()
);

create index on instalaciones (cliente_id);
create index on servicios (instalacion_id);
create index on pagos (servicio_id);
