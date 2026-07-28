const express = require("express");
const { 
    TikTokLiveConnection, 
    WebcastEvent 
} = require("tiktok-live-connector");


const app = express();

app.use(express.json());


const PORT = process.env.PORT || 3000;


const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;



if(!TIKTOK_USERNAME || !BRIDGE_TOKEN){

    console.error(
        "Falta TIKTOK_USERNAME ou BRIDGE_TOKEN"
    );

    process.exit(1);

}




// ==========================
// CONFIG
// ==========================


const MAX_QUEUE_SIZE = 500;


const EVENT_TIMEOUT = 600000;




// ==========================
// VARIAVEIS
// ==========================


let connection = null;

let connected = false;

let reconnecting = false;



const eventQueue = [];



const liveFollowers = new Set();



const usedUsers = new Set();



const pendingGifts = {};








// ==========================
// FUNÇÕES
// ==========================


function cleanUsername(name){

    return String(name || "")
    .replace("@","")
    .trim()
    .toLowerCase();

}






function createEvent(data){


    const event = {


        id:
        Date.now()+
        "-" +
        Math.random()
        .toString(36)
        .slice(2),



        eventType:
        data.eventType,



        username:
        cleanUsername(
            data.username
        ),



        comment:
        data.comment || "",



        giftName:
        data.giftName || "",



        coinValue:
        Number(
            data.coinValue || 0
        ),



        quantity:
        Number(
            data.quantity || 1
        ),




        createdAt:
        new Date()
        .toISOString()



    };



    eventQueue.push(event);



    while(eventQueue.length > MAX_QUEUE_SIZE){

        eventQueue.shift();

    }



    console.log(
        "EVENTO ADICIONADO:",
        event
    );


}







function authorized(req){

    return (
        req.get("x-bridge-token")
        ===
        BRIDGE_TOKEN
    );

}







// ==========================
// CONEXÃO TIKTOK
// ==========================


function createConnection(){



const conn =
new TikTokLiveConnection(

    TIKTOK_USERNAME,

    {

        processInitialData:false

    }

);





conn.on(
"disconnected",
()=>{


    console.log(
        "TikTok desconectado"
    );


    connected=false;


    reconnect();

}

);






conn.on(
"error",
(error)=>{


    console.log(
        "Erro TikTok:",
        error.message
    );


    connected=false;


    reconnect();


}

);







conn.on(
"follow",
(data)=>{


const username =
cleanUsername(

data.user?.uniqueId ||
data.user?.nickname

);



liveFollowers.add(username);



console.log(
"NOVO FOLLOW:",
username
);



}

);





conn.on(
"chat",
(data)=>{


    handleChat(data);


}

);






conn.on(
WebcastEvent.GIFT,
(data)=>{


    handleGift(data);


}

);




return conn;


}






async function reconnect(){


if(reconnecting)
return;



reconnecting=true;



console.log(
"Reconectando em 10 segundos..."
);



setTimeout(async()=>{


reconnecting=false;


connectTikTok();



},10000);



}

// ==========================
// CHAT
// ==========================


function handleChat(data){


const username =
cleanUsername(

data.user?.uniqueId ||
data.user?.nickname ||
"usuario"

);





const comment =
data.comment ||
data.message ||
data.text ||
"";





if(!comment)
return;





if(comment.includes("@"))
return;







// precisa ter seguido

if(!liveFollowers.has(username)){


console.log(
username,
"comentou mas não segue"
);


return;


}







if(usedUsers.has(username)){


console.log(
username,
"já tem personagem"
);


return;


}






usedUsers.add(username);






const coins =
pendingGifts[username]
||
0;






console.log("");
console.log("======================");
console.log("NOVO NPC");
console.log("TikTok:",username);
console.log("Roblox:",comment);
console.log("Moedas:",coins);
console.log("======================");






createEvent({


eventType:"comment",


username,


comment,


coinValue:coins,


quantity:1


});





delete pendingGifts[username];



}









// ==========================
// PRESENTES
// ==========================


function handleGift(data){



// final do presente

if(data.repeatEnd === false)
return;







const username =
cleanUsername(

data.user?.uniqueId ||
data.user?.nickname ||
"usuario"

);






if(!liveFollowers.has(username)){


console.log(
username,
"mandou presente mas não segue"
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
coinValue *
quantity;







console.log("");
console.log("======================");
console.log("PRESENTE");
console.log("Usuario:",username);
console.log("Gift:",giftName);
console.log("Moedas:",totalCoins);
console.log("======================");








// GALAXIA 1000+

if(
totalCoins >= 1000
&&
(
giftName
.toLowerCase()
.includes("galaxy")
||
giftName
.toLowerCase()
.includes("galaxia")
)

){


console.log(
"🚀 GALAXIA DETECTADA!"
);



createEvent({

eventType:"galaxy",


username,


giftName,


coinValue:totalCoins,


quantity


});



return;


}









// presente normal


pendingGifts[username] =

(
pendingGifts[username]
||
0
)

+

totalCoins;






console.log(
"Esperando nick Roblox:",
pendingGifts[username]
);


}











// ==========================
// API ROBLOX
// ==========================



app.get(
"/events",
(req,res)=>{


if(!authorized(req)){


return res.status(401)
.json({

error:"Unauthorized"

});


}






const events =
[...eventQueue];






// remove depois que entrega

eventQueue.length = 0;







res.json({

connected,


events


});





});









app.get(
"/",
(req,res)=>{


res.json({

service:
"tiktok-roblox-bridge",


connected,


username:
TIKTOK_USERNAME,


queuedEvents:
eventQueue.length


});


});

// ==========================
// CONECTAR TIKTOK
// ==========================


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
console.log("==========================");
console.log("✅ TIKTOK LIVE CONECTADO");
console.log("👤",TIKTOK_USERNAME);
console.log("==========================");







}catch(error){



connected=false;



console.log(
"Erro ao conectar:",
error.message
);



reconnect();



}



}











// ==========================
// LIMPEZA DE EVENTOS
// ==========================


setInterval(()=>{


const now =
Date.now();





for(
let i = eventQueue.length -1;
i >= 0;
i--
){





const event =
eventQueue[i];





const age =

now -
new Date(
event.createdAt
)
.getTime();






if(age > EVENT_TIMEOUT){


eventQueue.splice(
i,
1
);


}



}




},60000);











// ==========================
// LIMPEZA DE USUARIOS
// ==========================


setInterval(()=>{


usedUsers.clear();


console.log(
"Lista de usuarios resetada"
);



},1800000);












// ==========================
// START SERVER
// ==========================


app.listen(
PORT,
()=>{


console.log("");
console.log("==========================");
console.log("🚀 BRIDGE ONLINE");
console.log("🌐 PORTA:",PORT);
console.log("==========================");



connectTikTok();



});
