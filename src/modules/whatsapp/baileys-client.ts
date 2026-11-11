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
      
      // Extraemos el JID real. Si WhatsApp oculta el número, remoteJidAlt suele tener el número real (@s.whatsapp.net)
      const jidParaResponder = msg.key.remoteJid; 
      const jidRealParaBD = msg.key.remoteJidAlt || msg.key.remoteJid; 
      const whatsappIdInterno = jidRealParaBD.split('@')[0]; // Este puede ser el número o el LID

      if (texto) {
        console.log(`\n⏱️ [INICIO] Mensaje de ${whatsappIdInterno}: ${texto}`);

        try {
          await sock.sendPresenceUpdate('composing', jidParaResponder);

          if (!chatsActivos.has(jidParaResponder)) {
            const chat = ai.chats.create({
              model: MODELOS_DISPONIBLES[0],
              config: {
                systemInstruction: `Eres Jean, asesor comercial de EL&ectricidad en Cuba. 
Tu personalidad es cálida, empática, profesional. Aplicas el método "Growth Partner".

FASES:
- FASE 1 (RAPPORT): Si saluda, no hables de paneles. Preséntate, pregunta cómo está.
- FASE 2 (DIAGNÓSTICO): Si menciona energía o apagones, pregunta si es para casa o negocio.
- FASE 3 (CAPTACIÓN): Cuando pida cotización, dile que para guardarlo en el sistema necesita:
1. *Nombre completo*
2. *Número de WhatsApp (con código de país)*
3. *Correo electrónico*
4. *Tipo de servicio* (Residencial, Comercial o Industrial)
- FASE 4 (CIERRE): Agradece sus datos y dale los teléfonos: +5359524159 y +5354817974.

REGLA CRÍTICA DE SISTEMA:
Cuando el cliente te proporcione los 4 datos, DEBES incluir al final de tu respuesta esta etiqueta exacta sin negritas:
[DATOS_JSON: {"nombre":"...", "telefono_whatsapp":"...", "email":"...", "servicio":"..."}]

REGLAS:
1. NUNCA uses tablas. Usa viñetas (-) y emojis (☀️, 🔋, ⚡).
2. NO des precios de mano de obra a menos que los pidan.`
              }
            });
            chatsActivos.set(jidParaResponder, chat);
          }

          const chat = chatsActivos.get(jidParaResponder);
          let respuestaIA = '';
          let exito = false;

          for (const modelo of MODELOS_DISPONIBLES) {
            try {
              chat.model = modelo; 
              const response = await chat.sendMessage({ message: texto });
              respuestaIA = response.text || '';
              exito = true;
              break; 
            } catch (err) { await new Promise(r => setTimeout(r, 500)); }
          }

          if (!exito) throw new Error("Todos los modelos fallaron"); 

          // --- EXTRACCIÓN DE DATOS JSON ---
          const matchJSON = respuestaIA.match(/\[DATOS_JSON:\s*(\{.*?\})\]/s);
          
          if (matchJSON) {
            try {
              const datosCliente = JSON.parse(matchJSON[1]);
              console.log(`💾 [DB] RADAR ACTIVADO. Intentando guardar:`, datosCliente);
              
              if (datosCliente.nombre && datosCliente.telefono_whatsapp && datosCliente.email && datosCliente.servicio) {
                // Guardamos el numero que el cliente dio en 'telefono_contacto' y el ID interno en 'whatsapp_id'
                await pool.query(
                  `INSERT INTO clientes (whatsapp_id, nombre_completo, telefono_contacto, email, tipo_servicio) 
                   VALUES ($1, $2, $3, $4, $5) 
                   ON CONFLICT (whatsapp_id) 
                   DO UPDATE SET nombre_completo = $2, telefono_contacto = $3, email = $4, tipo_servicio = $5`,
                  [whatsappIdInterno, datosCliente.nombre, datosCliente.telefono_whatsapp, datosCliente.email, datosCliente.servicio]
                );
                console.log('✅ [DB] Cliente guardado exitosamente en Neon.');
                
                // Aviso a tu WhatsApp
                const tuNumeroAdmin = '5359524159@s.whatsapp.net'; 
                await sock.sendMessage(tuNumeroAdmin, { 
                  text: `💼 *NUEVO CLIENTE*\n👤 Nombre: ${datosCliente.nombre}\n📱 WhatsApp: ${datosCliente.telefono_whatsapp}\n📧 Email: ${datosCliente.email}\n⚡ Servicio: ${datosCliente.servicio}` 
                });
              } else {
                console.log('⚠️ [DB] El JSON no tenía todos los campos requeridos.');
              }
            } catch (jsonError) {
              console.error('❌ [DB] Error guardando en base de datos:', jsonError.message);
            }

            respuestaIA = respuestaIA.replace(/\[DATOS_JSON:\s*\{.*?\}\]/s, '').trim();
          }

          // --- ENVÍO DE RESPUESTA ---
          if (respuestaIA.includes('[MOSTRAR_FOTOS]')) {
            const textoLimpio = respuestaIA.replace('[MOSTRAR_FOTOS]', '').trim();
            if (textoLimpio) await sock.sendMessage(jidParaResponder, { text: textoLimpio });
            
            const listaFotos = [
              'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto1.jpg',
              'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto2.jpg',
              'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto3.jpg'
            ];
            for (let i = 0; i < listaFotos.length; i++) {
              await sock.sendMessage(jidParaResponder, { image: { url: listaFotos[i] }, caption: i === 0 ? 'Instalaciones reales' : '' });
              await new Promise(r => setTimeout(r, 500)); 
            }
          } else {
            await sock.sendMessage(jidParaResponder, { text: respuestaIA });
          }
          
        } catch (error) {
          console.error('❌ Error IA:', error);
          await sock.sendMessage(jidParaResponder, { text: 'Disculpe, tenemos problemas técnicos.' });
        }
      }
    });
  } catch (error) {
    console.error('Error fatal:', error);
  }
}