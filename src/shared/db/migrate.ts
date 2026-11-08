import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './pool.js';

async function ejecutar() {
  await pool.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const dir = path.resolve(process.cwd(), 'migrations');
  const archivos = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const hechas = new Set(
    (await pool.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name),
  );

  for (const archivo of archivos) {
    if (hechas.has(archivo)) continue;
    const sql = await readFile(path.join(dir, archivo), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations(name) values($1)', [archivo]);
      await client.query('commit');
      console.log('migración aplicada:', archivo);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

ejecutar().catch((error) => {
  console.error(error);
  process.exit(1);
});
