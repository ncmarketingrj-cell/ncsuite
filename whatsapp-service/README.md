# 📱 Gateway de WhatsApp Web para Alertas da NC Performance

Este é um microserviço em Node.js extremamente leve que conecta a sua conta do WhatsApp Web via **Baileys** e serve como um gateway de envio de mensagens para a **NC Performance Suite**.

Dessa forma, sempre que as regras de automação (CPL Alto ou Limites de Orçamento) forem ultrapassadas, ou quando chegar a hora do seu **Fechamento Diário (D-1 às 08:00)**, o sistema enviará um alerta em tempo real direto no seu WhatsApp!

---

## 🛠️ Como Rodar em 3 Passos Simples

### 1. Instalar as Dependências
Abra o terminal dentro desta pasta `whatsapp-service` e instale as dependências:
```bash
npm install
```

### 2. Iniciar o Serviço
Inicie o servidor Node:
```bash
npm start
```

### 3. Escanear o QR Code
1. No terminal, um **QR Code** será gerado automaticamente.
2. Abra o WhatsApp no seu celular.
3. Vá em **Aparelhos Conectados** → **Conectar um Aparelho** e escaneie o QR Code.
4. Pronto! A pasta `sessao/` será criada localmente e armazenará as credenciais. Você **não precisará** escanear de novo enquanto não desconectar do aparelho pelo celular.

---

## ⚙️ Configuração no Painel da NC Suite

Com o serviço rodando localmente (porta padrão: `http://localhost:3001`):

1. Acesse o painel da **NC Suite**.
2. Vá em **Configurações** → **Integrações Master**.
3. No campo **WhatsApp de Destino para Alertas**, insira o seu número completo com DDI e DDD (ex: `5521999999999`).
4. No campo **WhatsApp Gateway URL (Sessão Baileys)**, deixe o valor padrão: `http://localhost:3001` (ou a URL pública caso você suba o serviço em uma VPS/Servidor dedicado).
5. Clique em **Salvar Configurações**.

Pronto! Seu motor de alertas agora está integrado com o WhatsApp real! 🚀🏆🔥
