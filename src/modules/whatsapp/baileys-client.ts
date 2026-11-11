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
        console.log('\n📲 HAZ CLIC AQUÍ PARA VER EL QR:');
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
        console.log(qrUrl);
      }

      if (connection === 'open') {
        console.log('\n✅ ¡WHATSAPP CONECTADO EXITOSAMENTE! ✅\n');
      }

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
      // Limpiamos el ID de WhatsApp para tener una referencia
      const whatsappId = remitente.split('@')[0]; 

      if (texto) {
        console.log(`Mensaje de ${whatsappId}: ${texto}`);

        try {
          await sock.sendPresenceUpdate('composing', remitente);

          if (!chatsActivos.has(remitente)) {
            const chat = ai.chats.create({
              model: MODELOS_DISPONIBLES[0],
              config: {
                systemInstruction: `Eres Jean, asesor comercial de la empresa EL&ectricidad en Cuba. 
Tu personalidad es cálida, empática, profesional. Aplicas el método "Growth Partner".

FASES ESTRICTAS:
- FASE 1 (RAPPORT): Si el cliente saluda, NO hables de paneles. Preséntate, pregunta cómo está.
- FASE 2 (DIAGNÓSTICO): Si menciona energía o apagones, pregunta si es para casa o negocio y qué necesita.
- FASE 3 (CAPTACIÓN DE DATOS - OBLIGATORIO): Llegado este punto, dile que para enviarle una cotización formal y guardarlo en el sistema, necesitas sus datos. Pídele amablemente: *Nombre completo*, *Número de teléfono de contacto* y *Correo electrónico*.
- FASE 4 (CIERRE): Agradece sus datos, dile que un especialista lo contactará y dale los teléfonos: +5359524159 y +5354817974.

REGLA CRÍTICA DE SISTEMA:
Cuando el cliente te proporcione los datos (nombre, teléfono y email), DEBES incluir al final de tu respuesta este código oculto exacto (sin negritas ni nada):
[DATOS_CLIENTE: nombre="AQUI EL NOMBRE", telefono="AQUI EL TELEFONO", email="AQUI EL EMAIL"]
Si el cliente aún no te ha dado los 3 datos, NO uses esta etiqueta.

REGLAS:
1. NUNCA uses tablas. Usa viñetas (-), emojis (☀️, 🔋, ⚡) y negritas (*texto*).
2. NO des precios de mano de obra (800/1200 USD) ni garantías a menos que el cliente los pida explícitamente.
3. INSTRUCCIÓN DE FOTOS: Si piden fotos o experiencia, incluye la etiqueta [MOSTRAR_FOTOS] al final.`
              }
            });
            chatsActivos.set(remitente, chat);
          }

          const chat = chatsActivos.get(remitente);
          let respuestaIA = '';
          let exito = false;

          for (const modelo of MODELOS_DISPONIBLES) {
            try {
              chat.model = modelo; 
              const response = await chat.sendMessage({ message: texto });
              respuestaIA = response.text || '';
              exito = true;
              break; 
            } catch (err) { await new Promise(r => setTimeout(r, 1000)); }
          }

          if (!exito) throw new Error("Todos los modelos fallaron"); 

          // --- LÓGICA PARA EXTRAER LOS DATOS DEL CLIENTE ---
          const regexDatos = /\[DATOS_CLIENTE:\s*nombre="([^"]+)",\s*telefono="([^"]+)",\s*email="([^"]+)"\]/i;
          const matchDatos = respuestaIA.match(regexDatos);

          if (matchDatos) {
            const [_, nombre, telefono, email] = matchDatos;
            console.log(`💾 GUARDANDO CLIENTE: ${nombre} | ${telefono} | ${email}`);
            
            try {
              await pool.query(
                `UPDATE clientes SET nombre_completo = $1, telefono_contacto = $2, email = $3 WHERE whatsapp_id = $4`,
                [nombre, telefono, email, whatsappId]
              );
              
              // Si no existía, lo insertamos
              await pool.query(
                `INSERT INTO clientes (whatsapp_id, nombre_completo, telefono_contacto, email) 
                 VALUES ($1, $2, $3, $4) ON CONFLICT (whatsapp_id) DO NOTHING`,
                [whatsappId, nombre, telefono, email]
              );

              // Avisarte a tu WhatsApp personal
              const tuNumeroAdmin = '5359524159@s.whatsapp.net'; 
              await sock.sendMessage(tuNumeroAdmin, { 
                text: `💼 *NUEVO CLIENTE REGISTRADO*\n\n👤 Nombre: ${nombre}\n📞 Teléfono: ${telefono}\n📧 Email: ${email}\n📱 WhatsApp: ${whatsappId}` 
              });
            } catch (dbError) {
              console.error('⚠️ Error guardando en BD:', dbError.message);
            }

            // Limpiamos la etiqueta para que el cliente no la vea
            respuestaIA = respuestaIA.replace(regexDatos, '').trim();
          }

          // --- LÓGICA DE FOTOS ---
          if (respuestaIA.includes('[MOSTRAR_FOTOS]')) {
            const textoLimpio = respuestaIA.replace('[MOSTRAR_FOTOS]', '').trim();
            await sock.sendMessage(remitente, { text: textoLimpio });
            
            const listaFotos = [
              'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto1.jpg',
              'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto2.jpg',
              'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto3.jpg'
            ];
            
            for (let i = 0; i < listaFotos.length; i++) {
              await sock.sendMessage(remitente, { image: { url: listaFotos[i] }, caption: i === 0 ? 'Instalaciones reales' : '' });
              await new Promise(r => setTimeout(r, 1500)); 
            }
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