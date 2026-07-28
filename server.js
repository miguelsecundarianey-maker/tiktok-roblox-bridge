const express = require("express");
const { TikTokLiveConnection, WebcastEvent } = require("tiktok-live-connector");

const app = express();
app.use(express.json());


const PORT = process.env.PORT || 3000;


const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;


const MAX_QUEUE_SIZE = 500;


if (!TIKTOK_USERNAME || !BRIDGE_TOKEN) {

    console.error(
        "TIKTOK_USERNAME e BRIDGE_TOKEN são obrigatórios."
    );

    process.exit(1);

}




// =======================
// VARIÁVEIS GERAIS
// =======================


let connection = null;


let connected = false;


let reconnecting = false;



const eventQueue = [];



// Quem seguiu
const liveFollowers = new Set();



// Quem já criou personagem
const usedChatUsers = new Set();



// Presentes esperando nick Roblox
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
// CRIA CONEXÃO NOVA
// =======================


function createConnection(){



    const newConnection =
        new TikTokLiveConnection(

            TIKTOK_USERNAME,

            {

                processInitialData:false

            }

        );





    newConnection.on(
        "disconnected",
        ()=>{


            console.log(
                "⚠️ TikTok desconectou"
            );


            connected = false;


            scheduleReconnect();


        }
    );





    newConnection.on(
        "error",
        (error)=>{


            console.log(
                "❌ Erro TikTok:",
                error.message
            );


            connected = false;


            scheduleReconnect();


        }
    );





    newConnection.on(
        "follow",
        (data)=>{


            const username =
                cleanUsername(

                    data.user?.uniqueId ||
                    data.user?.nickname ||
                    "TikTokUser"

                );



            liveFollowers.add(username);



            console.log(
                `⭐ ${username} seguiu`
            );


        }
    );





    newConnection.on(
        "chat",
        (data)=>{


            handleChat(data);


        }
    );





    newConnection.on(
        WebcastEvent.GIFT,
        (data)=>{


            handleGift(data);


        }
    );





    return newConnection;


}







async function scheduleReconnect(){



    if(reconnecting){

        return;

    }



    reconnecting = true;



    console.log(
        "🔄 Tentando reconectar em 10 segundos..."
    );



    setTimeout(async()=>{


        reconnecting = false;


        await connectTikTok();


    },10000);


}
// =======================
// CHAT
// =======================


function handleChat(data){


    const username =
        cleanUsername(

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



    if(comment.includes("@")){

        return;

    }



    if(!liveFollowers.has(username)){

        console.log(
            `${username} comentou mas não segue`
        );

        return;

    }





    if(usedChatUsers.has(username)){


        console.log(
            `${username} já criou personagem`
        );


        return;

    }




    usedChatUsers.add(username);





    const totalCoins =
        pendingGifts[username] || 0;





    console.log("");
    console.log("==============================");
    console.log("🎮 NOVO PERSONAGEM");
    console.log("TikTok:",username);
    console.log("Roblox:",comment);
    console.log("Moedas:",totalCoins);
    console.log("==============================");





    addEvent({

        eventType:"comment",

        username,

        comment,

        coinValue:totalCoins,

        quantity:1

    });





    delete pendingGifts[username];


}








// =======================
// PRESENTES
// =======================


function handleGift(data){



    if(data.repeatEnd === false){

        return;

    }




    const username =
        cleanUsername(

            data.user?.uniqueId ||
            data.user?.nickname ||
            "TikTokUser"

        );





    if(!liveFollowers.has(username)){


        console.log(
            `${username} enviou presente mas não segue`
        );


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





    const totalCoins =
        coinValue * quantity;





    pendingGifts[username] =
        (pendingGifts[username] || 0)
        +
        totalCoins;






    console.log("");
    console.log("==============================");
    console.log("🎁 PRESENTE");
    console.log("Usuário:",username);
    console.log("Gift:",giftName);
    console.log("Moedas:",totalCoins);
    console.log("Total:",pendingGifts[username]);
    console.log("⏳ Esperando nick Roblox");
    console.log("==============================");



}









// =======================
// API ROBLOX
// =======================


app.get("/events",(req,res)=>{


    if(!isAuthorized(req)){


        return res.status(401).json({

            error:"Unauthorized"

        });


    }





    res.json({

        connected,

        events:eventQueue


    });


});








app.get("/",(req,res)=>{


    res.json({

        service:"tiktok-roblox-bridge",

        connected,

        username:TIKTOK_USERNAME,

        queuedEvents:eventQueue.length


    });


});









// =======================
// CONECTAR TIKTOK
// =======================


async function connectTikTok(){


    try{


        if(connection){


            try{

                await connection.disconnect();

            }catch(e){}


        }




        connection =
            createConnection();





        await connection.connect();





        connected = true;





        console.log("");
        console.log("==============================");
        console.log("✅ TikTok LIVE conectado");
        console.log("👤",TIKTOK_USERNAME);
        console.log("==============================");





    }catch(error){



        connected = false;



        console.log(
            "❌ Falha conexão:",
            error.message
        );



        scheduleReconnect();


    }



}









// =======================
// LIMPEZA
// =======================


setInterval(()=>{



    const now = Date.now();




    for(
        let i = eventQueue.length - 1;
        i >= 0;
        i--
    ){



        const age =

            now -
            new Date(
                eventQueue[i].createdAt
            ).getTime();





        if(age > 600000){


            eventQueue.splice(
                i,
                1
            );


        }


    }





},60000);









// =======================
// START
// =======================


app.listen(PORT,()=>{


    console.log("");
    console.log("==============================");
    console.log("🚀 Bridge online");
    console.log("🌐 Porta:",PORT);
    console.log("==============================");



    connectTikTok();



});
