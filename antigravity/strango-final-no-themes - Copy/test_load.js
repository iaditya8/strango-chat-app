const { io } = require("socket.io-client");

const URL = "http://localhost:4000";
const MAX_CLIENTS = 500; // Limit to 500 for this test run
const RAMP_UP_INTERVAL = 10; // ms between connections

let connectedCount = 0;
const sockets = [];

console.log(`🚀 Starting load test: Target ${MAX_CLIENTS} connections`);

function connectClient(index) {
    const socket = io(URL, {
        transports: ["websocket"],
        reconnection: false,
        forceNew: true,
    });

    socket.on("connect", () => {
        connectedCount++;
        if (connectedCount % 50 === 0) {
            console.log(`✅ Connected: ${connectedCount}/${MAX_CLIENTS}`);
        }
    });

    socket.on("connect_error", (err) => {
        console.error(`❌ Connection error (Client ${index}):`, err.message);
    });

    socket.on("disconnect", (reason) => {
        // Don't log expected disconnects at the end
        if (reason !== "io client disconnect") {
            console.log(`⚠️ Client ${index} disconnected: ${reason}`);
            connectedCount--;
        }
    });

    sockets.push(socket);
}

// Ramp up connections
let currentIndex = 0;
const interval = setInterval(() => {
    if (currentIndex >= MAX_CLIENTS) {
        clearInterval(interval);
        console.log("🏁 All connection attempts initiated. Waiting for stability...");

        // Hold connections for 10 seconds then clean up
        setTimeout(() => {
            console.log("🛑 Finishing test, disconnecting all clients...");
            sockets.forEach(s => s.disconnect());
            console.log("👋 Test complete.");
        }, 10000);
        return;
    }

    connectClient(currentIndex);
    currentIndex++;
}, RAMP_UP_INTERVAL);
