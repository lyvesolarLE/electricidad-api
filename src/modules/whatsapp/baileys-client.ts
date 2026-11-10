// @ts-nocheck
import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { GoogleGenAI } from '@google/genai';
import path from 'path';

const chatsActivos = new Map<string, any>();

// Función para obtener dinámicamente un modelo válido
async function obtenerModeloDisponible(ai: any) {
  try {
    // Preguntamos a la API qué modelos tenemos disponibles
    const modelosResponse = await ai.models.list();
    
    // Buscamos el primer modelo que sirva para chatear (generateContent)
    for await (const modelo of modelosResponse) {
      if (modelo.supportedGenerationMethods?.includes('generateContent') && modelo.name.includes('gemini')) {
        const nombreModelo = modelo.name.replace('models/', ''); // Limpiamos el prefijo
        console.log(`[MODELO] Usando modelo disponible: ${nombreModelo}`);
        return nombreModelo;
      }
    }
  } catch (error) {
    console.warn('[MODELO] No se pudo listar modelos, usando alias de respaldo...');
  }
  
  // Si falla la lista, usamos el alias 'latest' que apunta al modelo Flash más reciente
  console.log('[MODELO] Usando alias de respaldo: gemini-flash-latest');
  return 'gemini-flash-latest';
}

export async function iniciarWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestWaWebVersion();
    
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Obtenemos el nombre del modelo dinámicamente al arrancar
    const nombreModelo = await obtenerModeloDisponible(ai);

    const sock = makeWASocket({
      auth: state,
      version: version,
      browser: Browsers.ubuntu('Chrome'), 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n======================================================');
        console.log('📲 HAZ CLIC EN ESTE ENLACE PARA VER EL QR:');
        console.log('======================================================\n');
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
        console.log(qrUrl);
        console.log('\n======================================================');
      }

      if (connection === 'open') {
        console.log('\n✅ ¡WHATSAPP CONECTADO EXITOSAMENTE! ✅\n');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        console.log(`\n❌ Conexión cerrada. Código: ${statusCode}`);
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => iniciarWhatsApp(), 5000);
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;
      
      const texto = msg.message.conversation || msg.message.extendedTextMessage?.text;
      const remitente = msg.key.remoteJid;

      if (texto) {
        console.log(`Mensaje de ${remitente}: ${texto}`);
        try {
          await sock.sendPresenceUpdate('composing', remitente);

          if (!chatsActivos.has(remitente)) {
            const chat = ai.chats.create({
              model: nombreModelo, // Usamos el modelo que encontramos dinámicamente
              config: {
                systemInstruction: `Eres Jean...` // (Tu prompt de Growth Partner se mantiene igual)
              }
            });
            chatsActivos.set(remitente, chat);
          }

          const chat = chatsActivos.get(remitente);
          const response = await chat.sendMessage({ message: texto });
          const respuestaIA = response.text || '';

          if (respuestaIA.includes('[MOSTRAR_FOTOS]')) {
            const textoLimpio = respuestaIA.replace('[MOSTRAR_FOTOS]', '').trim();
            await sock.sendMessage(remitente, { text: textoLimpio });
            try {
              const rutaFoto1 = path.join(process.cwd(), 'assets', 'foto1.jpg');
              const rutaFoto2 = path.join(process.cwd(), 'assets', 'foto2.jpg');
              await sock.sendMessage(remitente, { image: { url: rutaFoto1 }, caption: 'Instalación residencial' });
              await new Promise(r => setTimeout(r, 1000)); 
              await sock.sendMessage(remitente, { image: { url: rutaFoto2 }, caption: 'Sistema industrial' });
            } catch (errorFoto) { console.error('Error fotos:', errorFoto); }
          } else {
            await sock.sendMessage(remitente, { text: respuestaIA });
          }

          console.log(`🤖 Jean: ${respuestaIA}`);
          
        } catch (error) {
          console.error('❌ Error IA:', error);
          await sock.sendMessage(remitente, { text: 'Disculpe, tenemos problemas técnicos. Llámenos al +5359524159.' });
        }
      }
    });

  } catch (error) {
    console.error('Error fatal:', error);
  }
}