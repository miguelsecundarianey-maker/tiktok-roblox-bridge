const express = require("express");
const { TikTokLiveConnection, WebcastEvent } = require("tiktok-live-connector");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;
const MAX_QUEUE_SIZE = 500;

if (!TIKTOK_USERNAME || !BRIDGE_TOKEN) {
  console.error("TIKTOK_USERNAME e BRIDGE_TOKEN são obrigatórios.");
  process.exit(1);
}

const connection = new TikTokLiveConnection(TIKTOK_USERNAME, {
  processInitialData: false
});
const eventQueue = [];
let connected = false;

function addEvent(event) {
  eventQueue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    eventType: event.eventType,
    username: event.username || "TikTokUser",
    giftType: event.giftType || "",
    coinValue: Number(event.coinValue || 0),
    quantity: Number(event.quantity || 1),
    comment: event.comment || "",
    createdAt: new Date().toISOString()
  });

  while (eventQueue.length > MAX_QUEUE_SIZE) {
    eventQueue.shift();
  }
}

function isAuthorized(request) {
  return request.get("x-bridge-token") === BRIDGE_TOKEN;
}

connection.on(WebcastEvent.CHAT, (data) => {
  const username =
    data.user?.uniqueId ||
    data.user?.nickname ||
    "TikTokUser";

  const comment = data.comment || "";

  addEvent({
    eventType: "comment",
    username,
    comment,
    coinValue: 0,
    quantity: 1
  });

  console.log(`Comentário: ${username}: ${comment}`);
});

connection.on(WebcastEvent.GIFT, (data) => {
  const giftName =
    data.giftDetails?.giftName ||
    data.giftName ||
    "Gift";

  const coinValue =
    Number(data.giftDetails?.diamondCount || 0);

  const quantity =
    Number(data.repeatCount || 1);

  const username =
    data.user?.uniqueId ||
    data.user?.nickname ||
    "TikTokUser";

  if (data.repeatEnd === false) {
    return;
  }

  addEvent({
    eventType: "gift",
    username,
    giftType: giftName,
    coinValue: coinValue * quantity,
    quantity
  });

  console.log(
    `Presente: ${username} enviou ${giftName} x${quantity} (${coinValue * quantity} moedas)`
  );
});

connection.on("connected", () => {
  connected = true;
  console.log(`Conectado ao TikTok LIVE de @${TIKTOK_USERNAME}`);
});

connection.on("disconnected", () => {
  connected = false;
  console.log("TikTok LIVE desconectado.");
});

connection.on("error", (error) => {
  connected = false;
  console.error("Erro TikTok:", error.message || error);
});

async function connectToTikTok() {
  try {
    await connection.connect();
  } catch (error) {
    connected = false;
    console.error("Falha ao conectar ao TikTok. Nova tentativa em 15 segundos.");
    setTimeout(connectToTikTok, 15000);
  }
}

app.get("/", (_request, response) => {
  response.json({
    service: "tiktok-roblox-bridge",
    connected,
    username: TIKTOK_USERNAME,
    queuedEvents: eventQueue.length
  });
});

app.get("/events", (request, response) => {
  if (!isAuthorized(request)) {
    return response.status(401).json({ error: "Não autorizado" });
  }

  const events = eventQueue.splice(0, eventQueue.length);

  return response.json({
    events
  });
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
  connectToTikTok();
});
