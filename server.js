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

const connection = new TikTokLiveConnection(
    TIKTOK_USERNAME,
    {
        processInitialData: false
    }
);

const eventQueue = [];

let connected = false;

// Pessoas que seguiram
const liveFollowers = new Set();

// Quem já criou personagem
const usedChatUsers = new Set();

// Presentes acumulados
const pendingGifts = {};

function cleanUsername(name){

    return String(name || "")
        .replace("@","")
        .trim()
        .toLowerCase();

}

function addEvent(event){

    eventQueue.push({

        id:
            `${Date.now()}-${Math.random().toString(36).slice(2)}`,

        eventType:
            event.eventType,

        username:
            cleanUsername(event.username),

        giftType:
            event.giftType || "",

        coinValue:
            Number(event.coinValue || 0),

        quantity:
            Number(event.quantity || 1),

        comment:
            event.comment || "",

        createdAt:
            new Date().toISOString()

    });

    while(eventQueue.length > MAX_QUEUE_SIZE){

        eventQueue.shift();

    }

}

function isAuthorized(request){

    return request.get("x-bridge-token") === BRIDGE_TOKEN;

}
// =======================
// FOLLOW
// =======================

connection.on("follow", (data) => {

    const username = cleanUsername(

        data.user?.uniqueId ||
        data.user?.nickname ||
        data.uniqueId ||
        data.nickname ||
        "TikTokUser"

    );

    if (liveFollowers.has(username)) {
        return;
    }

    liveFollowers.add(username);

    console.log(`⭐ ${username} começou a seguir.`);

});

// =======================
// CHAT
// =======================

connection.on("chat", (data) => {

    const username = cleanUsername(

        data.user?.uniqueId ||
        data.user?.nickname ||
        "TikTokUser"

    );

    const comment =
        data.comment ||
        data.message ||
        data.content ||
        data.text ||
        "";

    if (!comment) return;

    // Ignora mensagens com @
    if (comment.includes("@")) {
        return;
    }

    // Precisa seguir primeiro
    if (!liveFollowers.has(username)) {

        console.log(`${username} comentou mas não segue.`);

        return;

    }

    // Só pode criar um personagem
    if (usedChatUsers.has(username)) {

        console.log(`${username} já criou personagem.`);

        return;

    }

    usedChatUsers.add(username);

    // Pega todos os presentes acumulados
    const totalCoins = pendingGifts[username] || 0;

    console.log(
        `🎮 ${username} criou o personagem ${comment} (${totalCoins} moedas)`
    );

    addEvent({

        eventType: "comment",

        username,

        // Nick do Roblox
        comment,

        // Vai para o Roblox já com as moedas
        coinValue: totalCoins,

        quantity: 1

    });

    // Zera os presentes depois que criou
    pendingGifts[username] = 0;

});
// =======================
// PRESENTES
// =======================

connection.on(WebcastEvent.GIFT, (data) => {

    // Espera terminar o combo
    if (data.repeatEnd === false) {
        return;
    }

    const username = cleanUsername(

        data.user?.uniqueId ||
        data.user?.nickname ||
        "TikTokUser"

    );

    const giftName =

        data.giftDetails?.giftName ||
        data.giftName ||
        "Gift";

    const coinValue = Number(

        data.giftDetails?.diamondCount ||
        data.diamondCount ||
        0

    );

    const quantity = Number(

        data.repeatCount ||
        1

    );

    const totalCoins = coinValue * quantity;

    // Soma os presentes enviados antes do comentário
    pendingGifts[username] =
        (pendingGifts[username] || 0) +
        totalCoins;

    console.log("=================================");
    console.log("🎁 PRESENTE RECEBIDO");
    console.log("👤", username);
    console.log("🎁", giftName);
    console.log("📦 Quantidade:", quantity);
    console.log("💰 Moedas:", totalCoins);
    console.log("🔥 Total acumulado:", pendingGifts[username]);
    console.log("=================================");

});
// =======================
// CONEXÃO TIKTOK
// =======================

connection.on("connected", () => {

    connected = true;

    console.log("");
    console.log("======================================");
    console.log("🟢 TIKTOK LIVE CONECTADA");
    console.log("👤 @" + TIKTOK_USERNAME);
    console.log("======================================");
    console.log("");

});

connection.on("disconnected", () => {

    connected = false;

    console.log("");
    console.log("🔴 Live desconectada.");
    console.log("Tentando reconectar em 1 segundo...");
    console.log("");

    setTimeout(connectToTikTok, 1000);

});

connection.on("error", (error) => {

    connected = false;

    console.log("");
    console.log("❌ Erro:");
    console.log(error.message || error);
    console.log("Reconectando em 1 segundo...");
    console.log("");

    setTimeout(connectToTikTok, 1000);

});

async function connectToTikTok() {

    if (connected) return;

    try {

        console.log("Tentando conectar...");

        await connection.connect();

    } catch (error) {

        connected = false;

        console.log("Falhou.");

        setTimeout(connectToTikTok, 1000);

    }

}

// =======================
// STATUS
// =======================

app.get("/", (_request, response) => {

    response.json({

        service: "tiktok-roblox-bridge",

        connected,

        username: TIKTOK_USERNAME,

        queuedEvents: eventQueue.length,

        followersDuringLive: liveFollowers.size,

        followers: Array.from(liveFollowers),

        pendingGifts

    });

});

// =======================
// ROBLOX
// =======================

app.get("/events", (request, response) => {

    if (!isAuthorized(request)) {

        return response.status(401).json({

            error: "Não autorizado"

        });

    }

    const events = eventQueue.splice(0, eventQueue.length);

    response.json({

        events

    });

});

// =======================
// LIMPEZA
// =======================

setInterval(() => {

    console.log("🧹 Limpando cache.");

    for (const user in pendingGifts) {

        if (pendingGifts[user] <= 0) {

            delete pendingGifts[user];

        }

    }

}, 600000);

// =======================
// INICIAR
// =======================

app.listen(PORT, () => {

    console.log("");
    console.log("======================================");
    console.log(" TikTok Roblox Bridge ");
    console.log("======================================");
    console.log("👤 Conta: @" + TIKTOK_USERNAME);
    console.log("🌐 Porta: " + PORT);
    console.log("======================================");
    console.log("");

    connectToTikTok();

});
