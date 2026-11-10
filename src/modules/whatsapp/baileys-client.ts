// @ts-nocheck
import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';

// MEMORIA: Guardamos las conversaciones
const historialChats = new Map<string, any[]>();

export async function iniciarWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestWaWebVersion();
    
    // Inicializamos Google Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Configuramos el modelo y su "personalidad" (System Prompt)
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash", // Modelo gratuito, rápido y actual
      systemInstruction: `Eres Jean, asesor comercial de la empresa EL&ectricidad en Cuba. 
Tu personalidad es cálida, empática, profesional y muy conversadora. Aplicas el método "Growth Partner": primero eres un amigo, luego un consultor.

FASES ESTRICTAS DE LA CONVERSACIÓN:
- FASE 1 (RAPPORT): Si el cliente solo te saluda (ej. "Hola", "Buenas tardes"), NO LE HABLES DE PANELES SOLARES NI DE NEGOCIOS. Responde el saludo con calidez, preséntate por tu nombre (Jean), pregunta cómo está o muestra empatía por la situación del país. Espera a que el cliente te diga por qué te escribe.
- FASE 2 (TRANSICIÓN): Si el cliente responde a tu charla pero no menciona el tema solar, pregúntale amablemente en qué le puedes ayudar.
- FASE 3 (DIAGNÓSTICO): Solo cuando el cliente mencione energía, paneles, inversores o apagones, empieza a hacer preguntas para diagnosticar (¿Es para su casa, negocio o industria? ¿Qué equipos tiene actualmente?).
- FASE 4 (CIERRE): Invítalo a llamar a los teléfonos oficiales para la cotización final.

REGLAS DE ORO:
1. NUNCA uses tablas de Markdown. Usa viñetas (-), emojis (☀️, 🔋, ⚡) y negritas (*texto*).
2. NO SUELTES PRECIOS NI GARANTÍAS AL AZAR. Solo da precios, formas de pago o garantías SI EL CLIENTE TE LOS PIDE EXPLÍCITAMENTE.
3. GENERA AUTORIDAD: Si preguntan por tu experiencia, menciona con orgullo nuestro currículum.
4. INSTRUCCIÓN DE FOTOS: Si el cliente pregunta por experiencia o pide ver fotos, incluye la etiqueta exacta [MOSTRAR_FOTOS] al final de tu respuesta.

CURRÍCULUM DE EL&ectricidad:
- Sistemas eléctricos residenciales, industriales (baja/media tensión) y soterrados (+200 km de cables).
- +30 industrias y centros comerciales rehabilitados. +200 viviendas.
- Certificados en instalación fotovoltaica. +20 instalaciones con 0.4 MW.
- Paneles: 550 W a 650 W (el más comercial es de 620 W).

DATOS BAJO DEMANDA (Solo si el cliente pregunta explícitamente):
- Mano de obra: Inversor+batería (800 USD) / Inversor+batería+10 paneles (1200 USD).
- Pagos: CUP (al cambio del toque), USD, Euro, Pesos Mexicanos, Zelle.
- Garantía: 1 año (se anula si manipulan el equipo). Transporte y mantenimiento no incluidos.
- Teléfonos de contacto: +5359524159 y +5354817974.`
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
        console.log('\n======================================================');
        console.log('📲 ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP:');
        console.log('======================================================\n');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        console.log('\n✅ ¡WHATSAPP CONECTADO EXITOSAMENTE! ✅\n');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        console.log(`\n❌ Conexión cerrada. Código: ${statusCode}`);
        
        if (statusCode === 401 || statusCode === 405) {
          console.log('⚠️ ERROR DE RED: WhatsApp está rechazando tu IP.');
        } else if (statusCode === 515 || statusCode === 428) {
          iniciarWhatsApp(); 
        } else if (statusCode !== DisconnectReason.loggedOut) {
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
        console.log(`Mensaje recibido de ${remitente}: ${texto}`);
        
        try {
          await sock.sendPresenceUpdate('composing', remitente);

          let historial = historialChats.get(remitente) || [];
          historial.push({ role: 'user', content: texto });

          if (historial.length > 12) {
            historial = historial.slice(-12);
          }

          // Iniciamos un chat con el historial
          const chat = model.startChat({
            history: historial.slice(0, -1), // Todo menos el último mensaje
          });

          // Enviamos el mensaje actual
          const result = await chat.sendMessage(texto);
          const respuestaIA = result.response.text();

          // Lógica para enviar fotos si la IA lo solicita
          if (respuestaIA.includes('[MOSTRAR_FOTOS]')) {
            const textoLimpio = respuestaIA.replace('[MOSTRAR_FOTOS]', '').trim();
            await sock.sendMessage(remitente, { text: textoLimpio });
            
            try {
              const rutaFoto1 = path.join(process.cwd(), 'assets', 'foto1.jpg');
              const rutaFoto2 = path.join(process.cwd(), 'assets', 'foto2.jpg');
              
              await sock.sendMessage(remitente, { image: { url: rutaFoto1 }, caption: 'Instalación residencial EL&ectricidad' });
              await new Promise(r => setTimeout(r, 1000)); 
              await sock.sendMessage(remitente, { image: { url: rutaFoto2 }, caption: 'Sistema industrial con baterías de litio' });
              
              console.log(`📸 Fotos enviadas a ${remitente}`);
            } catch (errorFoto) {
              console.error('Error al enviar fotos:', errorFoto);
            }
          } else {
            await sock.sendMessage(remitente, { text: respuestaIA });
          }

          historial.push({ role: 'assistant', content: respuestaIA });
          historialChats.set(remitente, historial);
          
          console.log(`🤖 Jean respondió: ${respuestaIA}`);
          
        } catch (error) {
          console.error('❌ Error crítico con la IA de Google:', error);
          await sock.sendMessage(remitente, { text: 'Disculpe, en este momento estamos experimentando problemas técnicos. Por favor, intente de nuevo o llámenos al +5359524159.' });
        }
      }
    });

  } catch (error) {
    console.error('Error fatal dentro de Baileys:', error);
  }
}