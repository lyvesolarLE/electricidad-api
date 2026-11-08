import { buildApp } from './app.js';
import { config } from './shared/config.js';
import { RepositorioClavesPg } from './modules/claves/claves-pg.js';
import { asegurarClaveInicial } from './modules/claves/inicial.js';
import { pool } from './shared/db/pool.js';

const app = buildApp();

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

await asegurarClaveInicial(new RepositorioClavesPg(), app.log);
await app.listen({ port: config.port, host: '0.0.0.0' });
