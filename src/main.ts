import 'dotenv/config';
import { buildApp } from './app.js';
import { config } from './shared/config.js';
import { RepositorioClavesPg } from './modules/claves/claves-pg.js';
import { asegurarClaveInicial } from './modules/claves/inicial.js';
import { pool } from './shared/db/pool.js';
import { iniciarWhatsApp } from './modules/whatsapp/baileys-client.js'; // <-- Importación

const app = buildApp();

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
async function arrancarServidor() {
  try {
await asegurarClaveInicial(new RepositorioClavesPg(), app.log);
await app.listen({ port: config.port, host: '0.0.0.0' });


  // Iniciar Baileys después de que el servidor esté escuchando
        iniciarWhatsApp().catch((err) => {
      console.error('Error al iniciar WhatsApp:', err);
    });
    
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Llamamos a la función para que se ejecute
arrancarServidor();