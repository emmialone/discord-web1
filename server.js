const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Statik dosyaları sun
app.use(express.static(path.join(__dirname, 'public')));

// Sunucu durumu
const users = new Map(); // socketId -> { id, username, color, inVoice, isMuted, isDeafened }
const messages = []; // Son mesajlar (maksimum 100)

// Rastgele Discord tarzı avatar renkleri
const AVATAR_COLORS = [
    '#5865F2', // Blurple
    '#57F287', // Green
    '#FEE75C', // Yellow
    '#EB459E', // Fuchsia
    '#ED4245', // Red
    '#00A8FC', // Sky
    '#E91E63', // Pink
    '#9B59B6'  // Purple
];

function getRandomColor() {
    return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

io.on('connection', (socket) => {
    console.log(`[+] Yeni baglanti: ${socket.id}`);

    // Kullanıcı sunucuya ilk giriş yaptığında
    socket.on('user-init', ({ username }) => {
        const cleanName = (username || 'Misafir').trim().slice(0, 24) || 'Misafir';
        const color = getRandomColor();

        const userData = {
            id: socket.id,
            username: cleanName,
            color: color,
            inVoice: false,
            isMuted: false,
            isDeafened: false
        };

        users.set(socket.id, userData);

        // Kullanıcıya kendi bilgilerini ve mevcut sunucu durumunu gönder
        socket.emit('init-success', {
            self: userData,
            users: Array.from(users.values()),
            messages: messages.slice(-50),
            voiceUsers: Array.from(users.values()).filter(u => u.inVoice)
        });

        // Diğer herkese yeni kullanıcının geldiğini bildir
        socket.broadcast.emit('user-joined-server', userData);
        console.log(`[i] ${cleanName} (${socket.id}) sunucuya katildi.`);
    });

    // Metin mesajı gönderme
    socket.on('send-message', ({ text }) => {
        const user = users.get(socket.id);
        if (!user || !text || !text.trim()) return;

        const messageData = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            userId: user.id,
            username: user.username,
            color: user.color,
            text: text.trim().slice(0, 1000),
            time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        };

        messages.push(messageData);
        if (messages.length > 100) messages.shift();

        io.emit('new-message', messageData);
    });

    // Ses kanalına katılma
    socket.on('join-voice', () => {
        const user = users.get(socket.id);
        if (!user) return;

        user.inVoice = true;
        user.isMuted = false;
        user.isDeafened = false;
        socket.join('voice-room');

        // Odadaki mevcut diğer üyeler (bu kullanıcı hariç)
        const otherVoiceMembers = Array.from(users.values())
            .filter(u => u.inVoice && u.id !== socket.id);

        // Katılan kişiye mevcut seste olanları gönder
        socket.emit('voice-peers', otherVoiceMembers);

        // Odadaki diğer kullanıcılara yeni katılanı bildir
        socket.to('voice-room').emit('peer-joined-voice', user);

        // Tüm sunucuya ses kanalı listesini güncelle
        io.emit('voice-channel-update', Array.from(users.values()).filter(u => u.inVoice));

        console.log(`[🎙️] ${user.username} ses kanalina katildi.`);
    });

    // Ses kanalından ayrılma
    socket.on('leave-voice', () => {
        const user = users.get(socket.id);
        if (!user || !user.inVoice) return;

        user.inVoice = false;
        socket.leave('voice-room');

        socket.to('voice-room').emit('peer-left-voice', { id: socket.id, username: user.username });
        io.emit('voice-channel-update', Array.from(users.values()).filter(u => u.inVoice));

        console.log(`[👋] ${user.username} ses kanalindan ayrildi.`);
    });

    // WebRTC Sinyalleşmesi (Offer, Answer, ICE Candidate iletme)
    socket.on('webrtc-signal', ({ to, signal }) => {
        io.to(to).emit('webrtc-signal', {
            from: socket.id,
            signal: signal
        });
    });

    // Mikrofon ve Kulaklık durumu güncelleme
    socket.on('voice-state-update', ({ isMuted, isDeafened }) => {
        const user = users.get(socket.id);
        if (!user) return;

        user.isMuted = !!isMuted;
        user.isDeafened = !!isDeafened;

        io.to('voice-room').emit('peer-state-changed', {
            id: socket.id,
            isMuted: user.isMuted,
            isDeafened: user.isDeafened
        });

        io.emit('voice-channel-update', Array.from(users.values()).filter(u => u.inVoice));
    });

    // Konuşma durumu (Konuşurken yeşil çerçeve yakma)
    socket.on('speaking-state', ({ isSpeaking }) => {
        socket.to('voice-room').emit('peer-speaking', {
            id: socket.id,
            isSpeaking: !!isSpeaking
        });
    });

    // Bağlantı koptuğunda
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            console.log(`[-] Ayrildi: ${user.username} (${socket.id})`);
            if (user.inVoice) {
                socket.to('voice-room').emit('peer-left-voice', { id: socket.id, username: user.username });
            }
            users.delete(socket.id);
            io.emit('user-left-server', socket.id);
            io.emit('voice-channel-update', Array.from(users.values()).filter(u => u.inVoice));
        }
    });
});

// Yerel IP adreslerini listele
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                ips.push(net.address);
            }
        }
    }
    return ips;
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🎮 Discord Web Sunucusu Basariyla Calisiyor!`);
    console.log(`🌐 Bu Bilgisayardan:    http://localhost:${PORT}`);
    const localIPs = getLocalIPs();
    localIPs.forEach(ip => {
        console.log(`👥 Ayni Agdaki Arkadaslar: http://${ip}:${PORT}`);
    });
    console.log(`🚀 Uzak Sunucu (VPS):     http://SUNUCU_IP_ADRESI:${PORT}`);
    console.log(`======================================================\n`);
});
