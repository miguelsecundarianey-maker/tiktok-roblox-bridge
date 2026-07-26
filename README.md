# TikTok LIVE → Roblox Bridge

Ponte entre eventos do TikTok LIVE e o Roblox.

## 1. Criar o projeto no GitHub

1. Acesse https://github.com/new
2. Crie um repositório vazio.
3. Crie estes arquivos:
   - package.json
   - server.js
   - .env.example
   - README.md
4. Cole o conteúdo correspondente em cada arquivo.
5. Faça commit em `main`.

Não publique um arquivo `.env` no GitHub.

## 2. Publicar no Render

1. Acesse https://render.com
2. Crie uma conta usando GitHub.
3. Clique em `New` e depois `Web Service`.
4. Selecione este repositório.
5. Use:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Escolha o plano gratuito.
7. Crie as variáveis de ambiente:

TIKTOK_USERNAME
poagoat

BRIDGE_TOKEN
uma-chave-secreta-grande-e-aleatoria

8. Clique em `Create Web Service`.

A URL será parecida com:

https://nome-do-servico.onrender.com

O endpoint usado pelo Roblox será:

https://nome-do-servico.onrender.com/events

## 3. Configurar o Roblox

No script `ServerScriptService.TikTokLiveBridge`, altere:

local eventUrl = "https://SEU-SERVIDOR-RENDER.onrender.com/events"

Para a URL real:

local eventUrl = "https://nome-do-servico.onrender.com/events"

Altere também:

local bridgeToken = "COLOQUE_A_MESMA_CHAVE_DO_RENDER_AQUI"

Para exatamente o mesmo valor configurado no Render.

No Roblox Studio:

1. Abra Game Settings.
2. Acesse Security.
3. Ative `Allow HTTP Requests`.
4. Publique o jogo.

## 4. Formato enviado ao Roblox

Presente:

{
  "eventType": "gift",
  "username": "usuario_tiktok",
  "giftType": "Rose",
  "coinValue": 1,
  "quantity": 3
}

Comentário:

{
  "eventType": "comment",
  "username": "usuario_tiktok",
  "giftType": "",
  "coinValue": 0,
  "quantity": 1,
  "comment": "Olá"
}

O Roblox cria NPCs somente para eventos com:

"eventType": "gift"

A escala utilizada pelo Roblox é:

1 + coinValue / 100

O limite atual é escala 3x.
