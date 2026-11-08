alter table pagos
  add column estado text not null default 'confirmado' check (estado in ('pendiente','confirmado','rechazado')),
  add column pasarela text not null default 'manual',
  add column referencia_externa text;
