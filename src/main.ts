import 'dotenv/config';
import { buildApp } from './app.js';
import { config } from './shared/config.js';
import { RepositorioClavesPg } from './modules/claves/claves-pg.js';
import { asegurarClaveInicial } from './modules/claves/inicial.js';
import { pool } from './shared/db/pool.js';
import { iniciarWhatsApp } from './modules/whatsapp/baileys-client.js';

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
    // 1. Arrancamos el servidor web (Fastify)
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log('Servidor web escuchando...');

    // 2. Encendemos el bot de WhatsApp
    iniciarWhatsApp().catch((err) => {
      console.error('Error al iniciar WhatsApp:', err);
    });

    // 3. Verificamos la base de datos. Si falla, SOLO avisa, no apaga el bot.
    try {
      await asegurarClaveInicial(new RepositorioClavesPg(), app.log);
      console.log('Base de datos verificada correctamente.');
    } catch (dbErr) {
      console.warn('⚠️ Aviso: La base de datos no tiene las tablas creadas todavía.');
    }

  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Ejecutamos todo
arrancarServidor();