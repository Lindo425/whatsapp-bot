const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const axios = require("axios");
const fs = require("fs");
const express = require("express");
const qrcode = require("qrcode-terminal");

// Web server
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(3000, () => console.log("Server running"));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state
    });

    // QR + connection
    sock.ev.on("connection.update", (update) => {
        const { qr, connection } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
            console.log("✅ Bot connected");
        }

        if (connection === "close") {
            console.log("❌ Reconnecting...");
            startBot();
        }
    });

    sock.ev.on("creds.update", saveCreds);

    // MESSAGES
    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const sender = msg.key.remoteJid;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        console.log("📩", text);

        // PING
        if (text === "ping") {
            await sock.sendMessage(sender, { text: "🏓 pong" });
        }

        // DOWNLOAD
        if (text.startsWith("download ")) {
            const url = text.replace("download ", "").trim();

            try {
                await sock.sendMessage(sender, { text: "📥 Downloading..." });

                const response = await axios.get(url, {
                    responseType: "arraybuffer",
                    headers: {
                        "User-Agent": "Mozilla/5.0"
                    }
                });

                const contentType = response.headers["content-type"] || "application/octet-stream";
                const extension = contentType.split("/")[1] || "bin";
                const fileName = `file.${extension}`;

                fs.writeFileSync(fileName, response.data);

                await sock.sendMessage(sender, {
                    document: fs.readFileSync(fileName),
                    mimetype: contentType,
                    fileName: fileName
                });

                fs.unlinkSync(fileName);

            } catch (err) {
                console.log("❌ ERROR:", err.message);
                await sock.sendMessage(sender, { text: "❌ Failed to download." });
            }
        }
    });
}

startBot();