// @ts-nocheck
import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { GoogleGenAI } from '@google/genai';

const chatsActivos = new Map<string, any>();

// Lista de modelos ACTUALES y compatibles con v1beta
const MODELOS_DISPONIBLES = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite'
];

export async function iniciarWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestWaWebVersion();
    
    // FORZAMOS LA API v1beta PARA QUE LOS MODELOS NUEVOS FUNCIONEN
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

          // Sistema de Failover con los modelos actualizados
          for (const modelo of MODELOS_DISPONIBLES) {
            try {
              console.log(`[IA] Intentando con modelo: ${modelo}`);
              chat.model = modelo; 
              const response = await chat.sendMessage({ message: texto });
              respuestaIA = response.text || '';
              exito = true;
              console.log(`[IA] Éxito con modelo: ${modelo}`);
              break; 
            } catch (err) {
              ultimoError = err;
              console.warn(`[IA] Modelo ${modelo} falló. Probando siguiente...`);
              await new Promise(r => setTimeout(r, 1000)); 
            }
          }

          if (!exito) {
            throw ultimoError; 
          }

          // Lógica de Fotos usando enlaces Raw de GitHub
          if (respuestaIA.includes('[MOSTRAR_FOTOS]')) {
            const textoLimpio = respuestaIA.replace('[MOSTRAR_FOTOS]', '').trim();
            await sock.sendMessage(remitente, { text: textoLimpio });
            
            try {
              const listaFotos = [
                'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto1.jpg',
                'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto2.jpg',
                'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto3.jpg',
                'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto4.jpg',
                'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto5.jpg',
                'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto6.jpg',
                'https://raw.githubusercontent.com/lyvesolarLE/electricidad-api/main/assets/Foto7.jpg'
              ];
              
              for (let i = 0; i < listaFotos.length; i++) {
                await sock.sendMessage(remitente, { 
                  image: { url: listaFotos[i] }, 
                  caption: i === 0 ? 'Instalaciones reales de EL&ectricidad' : '' 
                });
                await new Promise(r => setTimeout(r, 1500)); 
              }
              
              console.log(`📸 Se enviaron ${listaFotos.length} fotos a ${remitente}`);
              
            } catch (errorFoto) { 
              console.error('Error al enviar fotos:', errorFoto); 
            }
          } else {
            await sock.sendMessage(remitente, { text: respuestaIA });
          }

          console.log(`🤖 Jean: ${respuestaIA}`);
          
        } catch (error) {
          console.error('❌ Error IA definitivo:', error);
          await sock.sendMessage(remitente, { text: 'Disculpe, nuestro asesor virtual está en mantenimiento. Por favor, llámenos al +5359524159.' });
        }
      }
    });

  } catch (error) {
    console.error('Error fatal:', error);
  }
}