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

// Quem seguiu a live
const liveFollowers = new Set();

// Quem já criou personagem
const usedChatUsers = new Set();

// Presentes aguardando o nick do Roblox
const pendingGifts = {};

function cleanUsername(name){

    return String(name || "")
        .replace("@","")
        .trim()
        .toLowerCase();

}

function addEvent(event){

    eventQueue.push({

        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,

        eventType: event.eventType,

        username: cleanUsername(event.username),

        giftType: event.giftType || "",

        coinValue: Number(event.coinValue || 0),

        quantity: Number(event.quantity || 1),

        comment: event.comment || "",

        createdAt: new Date().toISOString()

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

connection.on("follow",(data)=>{

    const username = cleanUsername(

        data.user?.uniqueId ||
        data.user?.nickname ||
        data.uniqueId ||
        data.nickname ||
        "TikTokUser"

    );

    if(liveFollowers.has(username)){
        return;
    }

    liveFollowers.add(username);

    console.log(`⭐ ${username} começou a seguir.`);

});
// =======================
// CHAT
// =======================

connection.on("chat",(data)=>{

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

    if(!comment){
        return;
    }

    // Ignora marcações
    if(comment.includes("@")){
        return;
    }

    // Precisa seguir a live
    if(!liveFollowers.has(username)){
        console.log(`${username} comentou mas não segue.`);
        return;
    }

    // Só cria um personagem
    if(usedChatUsers.has(username)){
        console.log(`${username} já criou personagem.`);
        return;
    }

    usedChatUsers.add(username);

    // Moedas acumuladas dos presentes
    const totalCoins = pendingGifts[username] || 0;

    console.log("");
    console.log("==============================");
    console.log("🎮 NOVO PERSONAGEM");
    console.log("TikTok :", username);
    console.log("Roblox :", comment);
    console.log("Moedas :", totalCoins);
    console.log("==============================");
    console.log("");

    addEvent({

        // Roblox vai criar usando o nick do comentário
        eventType: "comment",

        // Usuário do TikTok
        username,

        // Nick do Roblox
        comment,

        // Valor acumulado dos presentes
        coinValue: totalCoins,

        quantity: 1

    });

    // Limpa os presentes após criar o personagem
    delete pendingGifts[username];

});
// =======================
// PRESENTES
// =======================

connection.on(WebcastEvent.GIFT,(data)=>{

    // Espera terminar o combo
    if(data.repeatEnd === false){
        return;
    }

    const username = cleanUsername(

        data.user?.uniqueId ||
        data.user?.nickname ||
        "TikTokUser"

    );

    // Opcional: só aceita presentes de quem segue
    if(!liveFollowers.has(username)){
        console.log(`${username} enviou presente mas não segue.`);
        return;
    }

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

    // Apenas acumula as moedas.
    // NÃO cria NPC.
    pendingGifts[username] =
        (pendingGifts[username] || 0) +
        totalCoins;

    console.log("");
    console.log("====================================");
    console.log("🎁 PRESENTE RECEBIDO");
    console.log("👤 TikTok :", username);
    console.log("🎁 Presente:", giftName);
    console.log("📦 Quantidade:", quantity);
    console.log("💰 Recebidas:", totalCoins);
    console.log("🏦 Acumuladas:", pendingGifts[username]);
    console.log("⏳ Aguardando o nick do Roblox...");
    console.log("====================================");
    console.log("");

});
// =======================
// API PARA O ROBLOX
// =======================

app.get("/events",(req,res)=>{

    if(!isAuthorized(req)){
        return res.status(401).json({
            error:"Unauthorized"
        });
    }


    const lastId = req.query.lastId || "";


    let startIndex = 0;


    if(lastId){

        const index = eventQueue.findIndex(
            e => e.id === lastId
        );


        if(index !== -1){
            startIndex = index + 1;
        }

    }


    const events = eventQueue.slice(startIndex);


    res.json({

        connected,

        events

    });

});


// Status do servidor

app.get("/",(req,res)=>{

    res.json({

        service:"tiktok-roblox-bridge",

        connected,

        username:TIKTOK_USERNAME,

        queuedEvents:eventQueue.length

    });

});


// =======================
// CONEXÃO COM TIKTOK LIVE
// =======================


async function connectTikTok(){

    try{

        await connection.connect();


        connected = true;


        console.log("");
        console.log("==============================");
        console.log("✅ TikTok LIVE conectado");
        console.log("👤 Usuário:",TIKTOK_USERNAME);
        console.log("==============================");
        console.log("");



    }catch(error){


        connected = false;


        console.error(
            "❌ Erro ao conectar TikTok:",
            error.message
        );


        setTimeout(
            connectTikTok,
            10000
        );

    }

}



// =======================
// LIMPEZA AUTOMÁTICA
// =======================


setInterval(()=>{


    const now = Date.now();


    // Remove eventos antigos
    for(let i = eventQueue.length - 1; i >= 0; i--){

        const event = eventQueue[i];


        const age =
            now -
            new Date(event.createdAt).getTime();


        // 10 minutos
        if(age > 600000){

            eventQueue.splice(i,1);

        }

    }



    // Limpa usuários usados depois da live
    if(usedChatUsers.size > 10000){

        usedChatUsers.clear();

    }



},60000);



// =======================
// START SERVER
// =======================


app.listen(PORT,()=>{


    console.log("");
    console.log("==============================");
    console.log("🚀 Bridge online");
    console.log("🌐 Porta:",PORT);
    console.log("==============================");
    console.log("");


    connectTikTok();


});
