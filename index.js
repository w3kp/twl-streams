const WebSocket = require("ws");
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
    console.log("New connection initiated!");

    ws.on("message", (message) => {
        const msg = JSON.parse(message);
        switch (msg.event) {
            case "connected":
                console.log(`A new call has connected.`);
                break;
            case "start":
                console.log(`Starting media stream ${msg.streamSid}`);
                break;
            case "media":
                // console.log(`Receiving audio...`);
                break;
            case "connected":
                console.log(`Call has ended.`);
                break;
            default:
                break;
        }
    })
});
// <Stream url="wss://${req.headers.host}/" />

app.get("/", (req, res) => res.send("Hello CHATMSG!"));

app.post("/", (req, res) => {
    res.set("Content-Type", "text/xml");

    res.send(`
        <Response>
            <Start>
                <Stream url="wss://${req.headers.host}/" />
            </Start>
            <Say>Hi Don Chicken! Welcome to Chat MSG! Ipapapatwag ka sa Senado! Humanda ka!</Say>
            <Pause length="60" />
        </Response>
    `)
})

console.log("Listening at port 8080...");
server.listen(8080);