const _ = require("lodash");
const axios = require("axios");
const WebSocket = require("ws");
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server, clientTracking: true });
const path = require("path");

const bodyParser = require("body-parser");

//Include Google Speech to Text
const speech = require("@google-cloud/speech");
const speechClient = new speech.SpeechClient();

//Configure Transcription Request
const transcriptionConfig = {
    config: {
        encoding: "MULAW",
        sampleRateHertz: 8000,
        languageCode: "fil-PH",
    },
    interimResults: true, // If you want interim results, set this to true
};

let activeCalls = [];
let chatBotId = '4PxC1IMVLj0dsU0fjO-N2';

const sendMessagetoChatBase = (messageText, client, streamId, timeoutId) => {
    console.log('Sending Messages to Chatbot', {
        messageText, streamId, timeoutId
    });
    // Ask answer to our chatbot
    const fetchAPI = async () =>  {
        const answerResponse = await axios.post(`https://www.chatbase.co/api/v1/chat`, JSON.stringify({
            messages: [{role: 'user', content: messageText}],
            stream: false,
            temperature: 0,
            model: 'gpt-3.5-turbo',
            chatbotId: chatBotId
        }), {
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authorization: `Bearer ${process.env.CHATBASE_AUTH_TOKEN}`
            }
        });

        let _answer = null;

        if (answerResponse.data) {
            _answer = answerResponse.data.text;
        } else {
            _answer = `I can't understand what you we're saying. Sorry`;
        }

        clearTimeout(timeoutId);

        client.send(JSON.stringify({
            stream: streamId,
            event: "agent-response",
            text: _answer,
        }));

        return _answer;
    }
    fetchAPI();
};

wss.on("connection", (ws) => {
    console.log("New connection initiated!");

    let recognizeStream = null;
    let timeoutId = null;

    ws.on("message", (message) => {
        const msg = JSON.parse(message);

        switch (msg.event) {
            case "connected":
                console.log(`A new call has connected.`);
                break;
            case "start":
                console.log(`Starting media stream ${msg.streamSid}`);
                ws.streamSid = msg.streamSid;

                // Create Stream to the Google Speech to Text API
                recognizeStream = speechClient
                    .streamingRecognize(transcriptionConfig)
                    .on("error", console.error)
                    .on("data", (data) => {
                        if (timeoutId !== null) {
                            clearTimeout(timeoutId);
                        }

                        let _transcribeText = data.results[0].alternatives[0].transcript
                        wss.clients.forEach((client) => {
                            if (
                                client.readyState === WebSocket.OPEN &&
                                client.subscribedStream === msg.streamSid
                            ) {
                                timeoutId = setTimeout(() => {
                                    sendMessagetoChatBase(_transcribeText, client, msg.streamSid, timeoutId);
                                }, 1000);

                                client.send(JSON.stringify({
                                    stream: msg.streamSid,
                                    event: "interim-transcription",
                                    text: _transcribeText,
                                }));
                                client.send(JSON.stringify({
                                    stream: msg.streamSid,
                                    event: "agent-is-thinking",
                                    text: '',
                                }));
                            }
                        });
                    });

                activeCalls.push({
                    twilioStreamSid: msg.streamSid,
                    fromNumber: msg.start.customParameters.number,
                });

                wss.clients.forEach((client) => {
                    client.send(
                        JSON.stringify({
                        event: "updateCalls",
                        activeCalls,
                        })
                    );
                });

                console.log(`There are ${activeCalls.length} active calls`);
                break;
            case "media":
                // Write Media Packets to the recognize stream
                recognizeStream.write(msg.media.payload);
                break;
            case "stop":
                console.log(`Call Has Ended`);
                console.log(ws.streamSid);
                const i = activeCalls.findIndex(
                    (stream) => stream.streamSid === ws.streamSid
                );
                activeCalls.splice(i, 1);
                wss.clients.forEach((client) => {
                    client.send(
                    JSON.stringify({
                        event: "updateCalls",
                        activeCalls: activeCalls,
                    })
                    );
                });

                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                }
                recognizeStream.destroy();
                break;
            case "subscribe":
                console.log("Client Subscribed");
                ws.subscribedStream = msg.streamSid;
                break;
            default:
                break;
        }
    })
});
// <Stream url="wss://${req.headers.host}/" />
{/* <Say>I will stream the next 2 minutes of audio through your phone line</Say> */}
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: false }));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "/index.html")));

app.post("/", (req, res) => {
    res.set("Content-Type", "text/xml");
    res.send(`
        <Response>
        <Start>
            <Stream url="wss://${req.headers.host}/">
                <Parameter name="number" value="${req.body.From}"/>
            </Stream>
        </Start>
        <Pause length="120" />
        </Response>
    `);
})

console.log("Listening at port 8080...");
server.listen(8080);