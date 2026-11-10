// @ts-nocheck
import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';

const historialChats = new Map<string, any[]>();

export async function iniciarWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestWaWebVersion();
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
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
    });

    const sock = makeWASocket({
      auth: state,
      version: version,
      // LA MAGIA ESTÁ AQUÍ: Forzamos a que se identifique como Mac
      browser: Browsers.macOS('Desktop'), 
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

          let historial = historialChats.get(remitente) || [];
          historial.push({ role: 'user', content: texto });
          if (historial.length > 12) historial = historial.slice(-12);

          const chat = model.startChat({ history: historial.slice(0, -1) });
          const result = await chat.sendMessage(texto);
          const respuestaIA = result.response.text();

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

          historial.push({ role: 'assistant', content: respuestaIA });
          historialChats.set(remitente, historial);
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