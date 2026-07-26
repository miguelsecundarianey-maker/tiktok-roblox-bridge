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



const connection = new TikTokLiveConnection(
  TIKTOK_USERNAME,
  {
    processInitialData:false
  }
);



const eventQueue = [];

let connected = false;



// pessoas que seguiram nessa live
const liveFollowers = new Set();


// pessoas que já criaram personagem pelo chat
const usedChatUsers = new Set();





function cleanUsername(name){

  return String(name)
    .toLowerCase()
    .replace("@","")
    .trim();

}








function addEvent(event){


  eventQueue.push({

    id:
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,

    eventType:
      event.eventType,


    username:
      cleanUsername(event.username || "TikTokUser"),


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
// FOLLOW

connection.on("follow",(data)=>{


  const username =
    cleanUsername(
      data.user?.uniqueId ||
      data.user?.nickname ||
      data.uniqueId ||
      data.nickname ||
      "TikTokUser"
    );



  liveFollowers.add(username);



  console.log(
    "NOVO FOLLOW:",
    username
  );



});









// CHAT

connection.on("chat",(data)=>{


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



  if(!comment) return;




  if(comment.includes("@")){


    console.log(
      "CHAT ignorado:",
      comment
    );


    return;

  }






  // precisa ter seguido primeiro

  if(!liveFollowers.has(username)){


    console.log(
      "Pessoa não seguiu:",
      username
    );


    return;

  }







  // só deixa criar 1 personagem por seguidor

  if(usedChatUsers.has(username)){


    console.log(
      "Já criou personagem:",
      username
    );


    return;

  }






  usedChatUsers.add(username);







  console.log(
    "CHAT USADO:",
    username,
    "=>",
    comment
  );







  addEvent({

    eventType:"comment",

    username,

    comment,

    coinValue:0,

    quantity:1

  });



});
// PRESENTES

connection.on(WebcastEvent.GIFT,(data)=>{


  const giftName =
    data.giftDetails?.giftName ||
    data.giftName ||
    "Gift";



  const coinValue =
    Number(
      data.giftDetails?.diamondCount ||
      data.diamondCount ||
      0
    );



  const quantity =
    Number(
      data.repeatCount ||
      1
    );



  const username =
    cleanUsername(
      data.user?.uniqueId ||
      data.user?.nickname ||
      "TikTokUser"
    );





  // espera acabar a sequência do presente

  if(data.repeatEnd === false){

    return;

  }







  console.log(
    `PRESENTE: ${username} enviou ${giftName} x${quantity} (${coinValue} moedas)`
  );







  addEvent({

    eventType:"gift",

    username,

    giftType:giftName,

    coinValue:
      coinValue * quantity,

    quantity

  });



});









// CONEXÃO

connection.on("connected",()=>{


  connected = true;



  console.log(
    `Conectado ao TikTok LIVE de @${TIKTOK_USERNAME}`
  );


});







connection.on("disconnected",()=>{


  connected = false;



  console.log(
    "TikTok desconectado"
  );


});







connection.on("error",(error)=>{


  console.error(
    "Erro TikTok:",
    error.message || error
  );


});







async function connectToTikTok(){


  try{


    await connection.connect();



  }catch(error){


    console.log(
      "Erro ao conectar, tentando novamente..."
    );



    setTimeout(
      connectToTikTok,
      15000
    );


  }


}
// STATUS

app.get("/",(_request,response)=>{


  response.json({

    service:"tiktok-roblox-bridge",

    connected,

    username:TIKTOK_USERNAME,

    queuedEvents:
      eventQueue.length,


    followersDuringLive:
      liveFollowers.size,


    followers:
      Array.from(liveFollowers)

  });


});









// ROBLOX PEGA EVENTOS

app.get("/events",(request,response)=>{


  if(!isAuthorized(request)){


    return response.status(401).json({

      error:"Não autorizado"

    });


  }







  const events =
    eventQueue.splice(
      0,
      eventQueue.length
    );







  response.json({

    events

  });



});












// INICIAR SERVIDOR

app.listen(PORT,()=>{


  console.log(
    `Servidor iniciado na porta ${PORT}`
  );


  connectToTikTok();


});
