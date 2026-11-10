// @ts-nocheck
import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { GoogleGenAI } from '@google/genai';
import path from 'path';

const chatsActivos = new Map<string, any>();

// Lista de modelos en orden de preferencia (del más capaz al más ligero)
const MODELOS_DISPONIBLES = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite'
];

export async function iniciarWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestWaWebVersion();
    
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
            // Creamos el chat con el primer modelo de la lista por defecto
            const chat = ai.chats.create({
              model: MODELOS_DISPONIBLES[0],
              config: {
                systemInstruction: `Eres Jean, asesor comercial de la empresa EL&ectricidad en Cuba. 
Tu personalidad es cálida, empática, profesional y muy conversadora. Aplicas el método "Growth Partner": primero eres un amigo, luego un consultor.

FASES ESTRICTAS DE LA CONVERSACIÓN:
- FASE 1 (RAPPORT): Si el cliente solo te saluda, NO LE HABLES DE PANELES. Responde con calidez, preséntate (Jean), pregunta cómo está. Espera a que diga por qué escribe.
- FASE 2 (TRANSICIÓN): Si no menciona el tema solar, pregúntale en qué le puedes ayudar.
- FASE 3 (DIAGNÓSTICO): Solo cuando mencione energía, paneles o apagones, haz preguntas (¿Es para casa, negocio?).
- FASE 4 (CIERRE): Invítalo a llamar a los teléfonos oficiales para la cotización.

REGLAS:
1. NUNCA uses tablas de Markdown. Usa viñetas (-), emojis (☀️, 🔋, ⚡) y negritas (*texto*).
2. NO SUELTES PRECIOS NI GARANTÍAS AL AZAR. Solo si el cliente lo pide explícitamente.
3. Si preguntan por experiencia, menciona: +200km de cables, +30 industrias, +200 viviendas, certificados fotovoltaicos, +20 instalaciones con 0.4 MW. Paneles de 550W a 650W (comercial 620W).
4. INSTRUCCIÓN DE FOTOS: Si preguntan por experiencia o piden fotos, incluye la etiqueta exacta [MOSTRAR_FOTOS] al final.

DATOS BAJO DEMANDA (Solo si preguntan):
- Mano de obra: Inversor+batería (800 USD) / Inversor+batería+10 paneles (1200 USD).
- Pagos: CUP (al cambio del toque), USD, Euro, Pesos Mexicanos, Zelle.
- Garantía: 1 año (se anula si manipulan). Transporte y mantenimiento no incluidos.
- Teléfonos: +5359524159 y +5354817974.`
              }
            });
            chatsActivos.set(remitente, chat);
          }

          const chat = chatsActivos.get(remitente);
          let respuestaIA = '';
          let exito = false;
          let ultimoError = null;

          // Bucle de Failover: intenta con cada modelo hasta que uno funcione
          for (const modelo of MODELOS_DISPONIBLES) {
            try {
              console.log(`[IA] Intentando con modelo: ${modelo}`);
              // Si el chat se creó con otro modelo, lo actualizamos temporalmente
              chat.model = modelo; 
              
              const response = await chat.sendMessage({ message: texto });
              respuestaIA = response.text || '';
              exito = true;
              console.log(`[IA] Éxito con modelo: ${modelo}`);
              break; // Si funciona, salimos del bucle
            } catch (err) {
              ultimoError = err;
              console.warn(`[IA] Modelo ${modelo} falló (posible 503). Probando siguiente...`);
              // Pequeña pausa antes de reintentar con el siguiente modelo
              await new Promise(r => setTimeout(r, 1000)); 
            }
          }

          if (!exito) {
            throw ultimoError; // Si todos los modelos fallan, lanzamos el error
          }

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
          console.error('❌ Error IA definitivo (todos los modelos fallaron):', error);
          await sock.sendMessage(remitente, { text: 'Disculpe, nuestro asesor virtual está en mantenimiento por alta demanda. Por favor, llámenos al +5359524159.' });
        }
      }
    });

  } catch (error) {
    console.error('Error fatal:', error);
  }
}