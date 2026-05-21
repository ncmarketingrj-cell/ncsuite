// server.js
// Gateway de WhatsApp Web para Alertas da NC Performance Suite
// Baseado na biblioteca profissional @whiskeysockets/baileys

const express = require('express');
const cors = require('cors');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const SESSION_DIR = path.join(__dirname, 'sessao');

let sock = null;
let connectionStatus = 'close';

async function conectarWhatsApp() {
  console.log('🔄 Inicializando conexão com o WhatsApp Web...');
  
  // Garantir a pasta da sessão criada
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  // 1. Carregar as credenciais da sessão local
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  // 2. Instanciar o Baileys
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false, // Desabilitamos padrão e fazemos manual para ter controle
    defaultQueryTimeoutMs: undefined
  });

  // 3. Salvar credenciais automaticamente ao atualizar
  sock.ev.on('creds.update', saveCreds);

  // 4. Escutar atualizações de conexão e QR Code
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n======================================================');
      console.log('📱 ESCANEIE O QR CODE ABAIXO PARA CONECTAR AO WHATSAPP');
      console.log('======================================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\n======================================================');
    }

    if (connection === 'open') {
      connectionStatus = 'open';
      console.log('\n✅ [WHATSAPP] Conectado e autenticado com sucesso!');
      console.log('🚀 Gateway pronto para enviar alertas da NC Performance!\n');
    }

    if (connection === 'close') {
      connectionStatus = 'close';
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      
      console.log(`⚠️ [WHATSAPP] Conexão fechada. Motivo:`, lastDisconnect?.error);
      
      if (shouldReconnect) {
        console.log('🔄 Tentando reconectar automaticamente...');
        setTimeout(conectarWhatsApp, 5000);
      } else {
        console.log('❌ Sessão encerrada no celular. Apagando dados de sessão e gerando novo QR...');
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        setTimeout(conectarWhatsApp, 3000);
      }
    }
  });

  // 5. Escutar mensagens (opcional, para testes ou comandos futuros)
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type === 'notify') {
      const msg = messages[0];
      if (!msg.key.fromMe && msg.message?.conversation) {
        console.log(`💬 Mensagem recebida de ${msg.key.remoteJid}: ${msg.message.conversation}`);
      }
    }
  });
}

// ROTA: API para envio de mensagens
app.post('/send-message', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Parâmetros "phone" e "message" são obrigatórios.' });
  }

  if (connectionStatus !== 'open' || !sock) {
    return res.status(503).json({ error: 'Serviço de WhatsApp desconectado ou em inicialização.' });
  }

  try {
    // Tratar o formato do número
    let formattedPhone = phone.replace(/\D/g, "");
    if (!formattedPhone.endsWith('@s.whatsapp.net')) {
      formattedPhone = `${formattedPhone}@s.whatsapp.net`;
    }

    console.log(`✉️ [ENVIO] Enviando mensagem para ${formattedPhone}...`);
    
    // Disparar via Baileys
    const sentMsg = await sock.sendMessage(formattedPhone, { text: message });

    return res.json({ success: true, messageId: sentMsg.key.id });
  } catch (err) {
    console.error('❌ [ENVIO ERRO] Erro ao disparar mensagem:', err);
    return res.status(500).json({ error: 'Erro interno ao enviar mensagem.', details: err.message });
  }
});

// ROTA: Status do Serviço
app.get('/status', (req, res) => {
  res.json({
    status: connectionStatus,
    sessionDirExists: fs.existsSync(SESSION_DIR),
    credsExists: fs.existsSync(path.join(SESSION_DIR, 'creds.json'))
  });
});

// Inicializar Servidor e WhatsApp
app.listen(PORT, () => {
  console.log(`🚀 Gateway de WhatsApp rodando na porta ${PORT}`);
  conectarWhatsApp();
});
