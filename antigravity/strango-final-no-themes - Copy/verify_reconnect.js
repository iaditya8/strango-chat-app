const { io } = require("socket.io-client");

const URL = "http://localhost:4000";
let clientA, clientB;
let reconnectToken;

console.log("🔄 Starting Reconnection System Verification...");

function createClient(name) {
    const socket = io(URL, {
        transports: ["websocket"],
        reconnection: false, // We handle reconnection manually for the test
        forceNew: true,
    });
    socket.name = name;
    return socket;
}

// SIMULATION STEPS
async function runTest() {
    // 1. Connect Client A
    clientA = createClient("Client A");

    await new Promise(resolve => clientA.on("connect", resolve));
    console.log("✅ Client A connected:", clientA.id);

    // 2. Connect Client B
    clientB = createClient("Client B");
    await new Promise(resolve => clientB.on("connect", resolve));
    console.log("✅ Client B connected:", clientB.id);

    // 3. Initiate Matchmaking
    console.log("🔍 Starting matchmaking...");

    clientA.emit("find-partner", { country: "any", gender: "any", name: "UserA" });
    clientB.emit("find-partner", { country: "any", gender: "any", name: "UserB" });

    // 4. Wait for match and get token
    await new Promise((resolve) => {
        clientA.on("partner-found", (data) => {
            console.log("🎉 Match found!");
            if (data.reconnectToken) {
                reconnectToken = data.reconnectToken;
                console.log("🔑 Received Reconnect Token:", reconnectToken);
                resolve();
            } else {
                console.error("❌ No reconnect token received!");
                process.exit(1);
            }
        });
    });

    // 5. Simulate Client A Disconnect (Refresh)
    console.log("🔌 Simulating Client A Disconnect...");
    clientA.disconnect();

    // Wait a bit to simulate page reload time
    await new Promise(r => setTimeout(r, 1000));

    // 6. Reconnect Client A (New Socket)
    console.log("🔄 Client A reconnecting with token...");
    const clientAReconnected = createClient("Client A (Reconnected)");

    await new Promise(resolve => clientAReconnected.on("connect", resolve));

    // 7. Emit Reconnect Event
    clientAReconnected.emit("reconnect-with-token", { reconnectToken });

    // 8. Verify Reconnection Success
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timeout waiting for partner-reconnected")), 5000);

        clientAReconnected.on("partner-reconnected", (data) => {
            clearTimeout(timeout);
            console.log("✅ Client A received 'partner-reconnected'");
            console.log("   - Room ID:", data.roomId);
            console.log("   - Partner:", data.partnerName);
        });

        clientB.on("partner-reconnected", (data) => {
            console.log("✅ Client B received 'partner-reconnected'");
            resolve();
        });

        clientAReconnected.on("reconnect-failed", (data) => {
            clearTimeout(timeout);
            reject(new Error(`Reconnection failed: ${data.reason}`));
        });
    });

    console.log("🏆 TEST PASSED: Reconnection logic is verified!");

    // Cleanup
    clientAReconnected.disconnect();
    clientB.disconnect();
}

runTest().catch(err => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
});
