// @ts-nocheck
import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { GoogleGenAI } from '@google/genai';
import { pool } from '../../shared/db/pool.js';

const chatsActivos = new Map<string, any>();
const MODELOS_DISPONIBLES = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

export async function iniciarWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestWaWebVersion();
    
    const ai = new GoogleGenAI({ 
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { apiVersion: 'v1beta' }
    });

    const sock = makeWASocket({
      auth: state,
      version: version,
      browser: Browsers.ubuntu('Chrome'), 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
        console.log('\n📲 HAZ CLIC AQUÍ PARA VER EL QR:\n', qrUrl, '\n');
      }
      if (connection === 'open') console.log('\n✅ ¡WHATSAPP CONECTADO EXITOSAMENTE! ✅\n');
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) setTimeout(() => iniciarWhatsApp(), 5000);
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;
      
      const texto = msg.message.conversation || msg.message.extendedTextMessage?.text;
      const remitente = msg.key.remoteJid;
      const whatsappId = remitente.split('@')[0]; 

      if (texto) {
        console.log(`\n⏱️ [INICIO] Mensaje de ${whatsappId}: ${texto}`);
        const tiempoInicio = Date.now();

        try {
          await sock.sendPresenceUpdate('composing', remitente);

          if (!chatsActivos.has(remitente)) {
            const chat = ai.chats.create({
              model: MODELOS_DISPONIBLES[0],
              config: {
                systemInstruction: `Eres Jean, asesor comercial de EL&ectricidad. (Mantén tu prompt de Growth Partner y la etiqueta [DATOS_CLIENTE] aquí)`
              }
            });
            chatsActivos.set(remitente, chat);
          }

          const chat = chatsActivos.get(remitente);
          let respuestaIA = '';
          let exito = false;

          // ⏱️ Medimos cuánto tarda la IA
          const tiempoIAInicio = Date.now();
          for (const modelo of MODELOS_DISPONIBLES) {
            try {
              chat.model = modelo; 
              const response = await chat.sendMessage({ message: texto });
              respuestaIA = response.text || '';
              exito = true;
              console.log(`⏱️ [IA] Respondió en ${Date.now() - tiempoIAInicio}ms usando ${modelo}`);
              break; 
            } catch (err) { await new Promise(r => setTimeout(r, 500)); } // Bajamos la espera a 0.5s
          }
          if (!exito) throw new Error("Todos los modelos fallaron"); 

          // --- GUARDADO EN BASE DE DATOS ---
          const regexDatos = /\[DATOS_CLIENTE:\s*nombre=["']([^"']+)["'],\s*telefono=["']([^"']+)["'],\s*email=["']([^"']+)["']\]/i;
          const matchDatos = respuestaIA.match(regexDatos);

          if (matchDatos) {
            const [_, nombre, telefono, email] = matchDatos;
            console.log(`⏱️ [DB] Guardando cliente...`);
            
            try {
              await pool.query(
                `INSERT INTO clientes (whatsapp_id, nombre_completo, telefono_contacto, email) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (whatsapp_id) 
                 DO UPDATE SET nombre_completo = $2, telefono_contacto = $3, email = $4`,
                [whatsappId, nombre, telefono, email]
              );
              const tuNumeroAdmin = '5359524159@s.whatsapp.net'; 
              await sock.sendMessage(tuNumeroAdmin, { text: `💼 *NUEVO CLIENTE*\nNombre: ${nombre}\nTel: ${telefono}\nEmail: ${email}` });
            } catch (dbError) { console.error('❌ ERROR DB:', dbError.message); }

            respuestaIA = respuestaIA.replace(regexDatos, '').trim();
          }

          // --- ENVÍO DE RESPUESTA Y FOTOS ---
          if (respuestaIA.includes('[MOSTRAR_FOTOS]')) {
            const textoLimpio = respuestaIA.replace('[MOSTRAR_FOTOS]', '').trim();
            if (textoLimpio) await sock.sendMessage(remitente, { text: textoLimpio });
            
            const listaFotos = [
              'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto1.jpg',
              'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto2.jpg',
              'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto3.jpg'
            ];
            for (let i = 0; i < listaFotos.length; i++) {
              await sock.sendMessage(remitente, { image: { url: listaFotos[i] }, caption: i === 0 ? 'Instalaciones reales' : '' });
              await new Promise(r => setTimeout(r, 500)); // ⚡ Bajamos la espera a 0.5s para que sea más rápido
            }
          } else {
            await sock.sendMessage(remitente, { text: respuestaIA });
          }

          console.log(`⏱️ [FIN] Proceso total tomó ${Date.now() - tiempoInicio}ms`);
          
        } catch (error) {
          console.error('❌ Error IA:', error);
          await sock.sendMessage(remitente, { text: 'Disculpe, tenemos problemas técnicos.' });
        }
      }
    });
  } catch (error) {
    console.error('Error fatal:', error);
  }
}