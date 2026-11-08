-- Tarifas configurables: 'fijo' = monto en USD; 'porcentaje' = % del valor de los equipos (3 = 3 %).
create table tarifas (
  concepto text primary key check (concepto in ('asesoria','mantenimiento','mano_de_obra','monitoreo','atencion_vip')),
  tipo text not null check (tipo in ('fijo','porcentaje')),
  valor numeric(10,4) not null check (valor >= 0),
  actualizado_en timestamptz not null default now()
);

insert into tarifas (concepto, tipo, valor) values
  ('asesoria', 'fijo', 15),
  ('mantenimiento', 'porcentaje', 3),
  ('mano_de_obra', 'porcentaje', 20),
  ('monitoreo', 'porcentaje', 2),
  ('atencion_vip', 'porcentaje', 1.5);

alter table servicios drop constraint servicios_tipo_check;
alter table servicios add constraint servicios_tipo_check
  check (tipo in ('asesoria','mantenimiento','mano_de_obra','monitoreo','atencion_vip'));
