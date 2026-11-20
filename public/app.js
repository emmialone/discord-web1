// ==========================================
// DISCORD WEB - İSTEMCİ KODLARI
// WebRTC + Socket.io + Web Audio API
// ==========================================

const socket = io();

// DOM Elementleri
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');

const myAvatar = document.getElementById('my-avatar');
const myUsername = document.getElementById('my-username');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnToggleDeaf = document.getElementById('btn-toggle-deaf');
const btnToggleNoise = document.getElementById('btn-toggle-noise');

const textChannelBtn = document.getElementById('text-channel-btn');
const voiceChannelBtn = document.getElementById('voice-channel-btn');
const tabTextBtn = document.getElementById('tab-text-btn');
const tabVoiceBtn = document.getElementById('tab-voice-btn');

const chatView = document.getElementById('chat-view');
const voiceView = document.getElementById('voice-view');
const messagesList = document.getElementById('messages-list');
const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

const headerIcon = document.getElementById('header-icon');
const headerTitle = document.getElementById('header-title');
const headerDesc = document.getElementById('header-desc');

const membersList = document.getElementById('members-list');
const onlineCount = document.getElementById('online-count');
const voiceCountBadge = document.getElementById('voice-count-badge');
const voiceTabCount = document.getElementById('voice-tab-count');
const voiceUserSublist = document.getElementById('voice-user-sublist');

const voiceStatusBox = document.getElementById('voice-status-box');
const btnQuickDisconnect = document.getElementById('btn-quick-disconnect');
const btnJoinVoice = document.getElementById('btn-join-voice');
const btnLeaveVoice = document.getElementById('btn-leave-voice');
const voiceGrid = document.getElementById('voice-grid');
const audioContainer = document.getElementById('audio-container');

// Durum Değişkenleri
let currentUser = null;
let allUsers = [];
let rawLocalStream = null;
let localStream = null;
let audioContext = null;
let analyser = null;
let gateGainNode = null;
let vadInterval = null;
let isMuted = false;
let isDeafened = false;
let isNoiseSuppression = true;
let isInVoice = false;

// WebRTC PeerConnections: peerSocketId -> RTCPeerConnection
const peerConnections = new Map();

// Google STUN Sunucusu
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// ==========================================
// DİSCORD SES EFEKTLERİ (Sentetik Web Audio)
// ==========================================
function playTone(freq1, freq2, duration = 0.15) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(freq1, now);
        if (freq2) {
            osc.frequency.exponentialRampToValueAtTime(freq2, now + duration);
        }

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.start(now);
        osc.stop(now + duration);
    } catch (e) {
        // Tarayıcı izin vermezse yoksay
    }
}

const Sounds = {
    join: () => { playTone(440, 880, 0.2); },
    leave: () => { playTone(660, 330, 0.2); },
    mute: () => { playTone(300, 200, 0.12); },
    unmute: () => { playTone(400, 600, 0.12); },
    message: () => { playTone(800, 950, 0.1); }
};

// ==========================================
// 1. KULLANICI GİRİŞİ & BAŞLANGIÇ
// ==========================================
const savedNick = localStorage.getItem('discord_web_nick');
if (savedNick) {
    usernameInput.value = savedNick;
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nick = usernameInput.value.trim();
    if (!nick) return;

    localStorage.setItem('discord_web_nick', nick);
    loginModal.style.display = 'none';

    // Sunucuya kullanıcı bilgisini ilet
    socket.emit('user-init', { username: nick });
});

socket.on('init-success', ({ self, users, messages, voiceUsers }) => {
    currentUser = self;
    allUsers = users;

    myUsername.textContent = self.username;
    myAvatar.textContent = self.username.charAt(0).toUpperCase();
    myAvatar.style.backgroundColor = self.color;

    // Mesaj geçmişini yükle
    messagesList.innerHTML = '';
    messages.forEach(renderMessage);
    scrollToBottom();

    // Üye ve ses listesini güncelle
    updateMembersList(users);
    updateVoiceUI(voiceUsers);
});

// Yeni kullanıcı katıldı
socket.on('user-joined-server', (user) => {
    allUsers.push(user);
    updateMembersList(allUsers);
});

// Kullanıcı ayrıldı
socket.on('user-left-server', (userId) => {
    allUsers = allUsers.filter(u => u.id !== userId);
    updateMembersList(allUsers);
    removePeerConnection(userId);
});

// ==========================================
// 2. METİN SOHBETİ
// ==========================================
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    socket.emit('send-message', { text });
    chatInput.value = '';
});

socket.on('new-message', (msg) => {
    renderMessage(msg);
    scrollToBottom();
    if (msg.userId !== socket.id) {
        Sounds.message();
    }
});

function renderMessage(msg) {
    const div = document.createElement('div');
    div.className = 'message-item';

    const initial = (msg.username || '?').charAt(0).toUpperCase();
    const color = msg.color || '#5865F2';

    div.innerHTML = `
        <div class="message-avatar" style="background-color: ${color}">${initial}</div>
        <div class="message-content">
            <div class="message-meta">
                <span class="message-author">${escapeHtml(msg.username)}</span>
                <span class="message-time">${msg.time}</span>
            </div>
            <div class="message-text">${formatMessageText(escapeHtml(msg.text))}</div>
        </div>
    `;

    messagesList.appendChild(div);
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMessageText(text) {
    // URL'leri tıklanabilir yap
    const urlPattern = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim;
    return text.replace(urlPattern, '<a href="$1" target="_blank" style="color: #00A8FC; text-decoration: underline;">$1</a>');
}

// ==========================================
// 3. SEKMELER & GÖRÜNÜM DEĞİŞİMİ
// ==========================================
function switchView(viewName) {
    if (viewName === 'text') {
        chatView.classList.add('active');
        voiceView.classList.remove('active');
        tabTextBtn.classList.add('active');
        tabVoiceBtn.classList.remove('active');
        textChannelBtn.classList.add('active');
        voiceChannelBtn.classList.remove('active');

        headerIcon.textContent = '#';
        headerTitle.textContent = 'genel-sohbet';
        headerDesc.textContent = 'Arkadaşlar için tek ve ortak metin kanalı';
    } else {
        chatView.classList.remove('active');
        voiceView.classList.add('active');
        tabTextBtn.classList.remove('active');
        tabVoiceBtn.classList.add('active');
        textChannelBtn.classList.remove('active');
        voiceChannelBtn.classList.add('active');

        headerIcon.textContent = '🔊';
        headerTitle.textContent = 'Genel Ses';
        headerDesc.textContent = 'Sıfır gecikmeli WebRTC ses kanalı';
    }
}

textChannelBtn.addEventListener('click', () => switchView('text'));
voiceChannelBtn.addEventListener('click', () => {
    switchView('voice');
    // Eğer henüz seste değilse otomatik katılmayı da kolaylaştır
    if (!isInVoice) {
        joinVoiceChannel();
    }
});
tabTextBtn.addEventListener('click', () => switchView('text'));
tabVoiceBtn.addEventListener('click', () => switchView('voice'));

// ==========================================
// 4. SES KANALI & WebRTC MESH
// ==========================================
btnJoinVoice.addEventListener('click', joinVoiceChannel);
btnLeaveVoice.addEventListener('click', leaveVoiceChannel);
btnQuickDisconnect.addEventListener('click', leaveVoiceChannel);

async function joinVoiceChannel() {
    if (isInVoice) return;

    try {
        // 1. Donanımsal mikrofon filtresi ile mikrofonu al
        rawLocalStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
                channelCount: 1
            },
            video: false
        });

        // 2. Web Audio DSP Boru Hattı (Highpass + Lowpass + Akıllı Gürültü Kapısı / Noise Gate)
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        const source = audioContext.createMediaStreamSource(rawLocalStream);

        // Fan, klima ve masa vuruntu uğultularını kesen Yüksek Geçiren Filtre (85Hz)
        const highpass = audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(85, audioContext.currentTime);

        // Yüksek frekanslı tıslama seslerini kesen Alçak Geçiren Filtre (12kHz)
        const lowpass = audioContext.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(12000, audioContext.currentTime);

        // Akıllı Gürültü Kapısı (Noise Gate)
        gateGainNode = audioContext.createGain();
        gateGainNode.gain.setValueAtTime(1.0, audioContext.currentTime);

        // Ses Seviyesi Analizörü (VAD ve görsel yeşil halka için)
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;

        // Bağlantılar: Mic -> Highpass -> Lowpass -> Gate -> Output Stream
        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(analyser);
        lowpass.connect(gateGainNode);

        const destination = audioContext.createMediaStreamDestination();
        gateGainNode.connect(destination);

        // Karşı tarafa gidecek temizlenmiş ses akışı
        localStream = destination.stream;

        isInVoice = true;
        Sounds.join();

        // UI Güncellemeleri
        voiceStatusBox.style.display = 'flex';
        btnJoinVoice.style.display = 'none';
        btnLeaveVoice.style.display = 'block';

        if (window.Android) {
            try { window.Android.onVoiceJoined(); } catch(e){}
        }

        // Ses aktivitesi algılama (VAD) ve gürültü kesici döngüsünü başlat
        startVoiceProcessing();

        // Kendi ses kartımızı grid'e ekle
        renderLocalVoiceTile();

        // Sunucuya ses kanalına girdiğimizi bildir
        socket.emit('join-voice');
    } catch (err) {
        console.error('Mikrofon erisim hatasi:', err);
        alert('Mikrofona erişilemedi! Lütfen tarayıcıdan mikrofon izni verdiğinizden emin olun.\n\nNot: Modern tarayıcılarda mikrofon için site localhost veya HTTPS olmalıdır.');
    }
}

function leaveVoiceChannel() {
    if (!isInVoice) return;

    Sounds.leave();
    isInVoice = false;

    // Mikrofon akışlarını durdur
    if (rawLocalStream) {
        rawLocalStream.getTracks().forEach(t => t.stop());
        rawLocalStream = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }

    // AudioContext ve VAD temizle
    if (vadInterval) clearInterval(vadInterval);
    if (audioContext) {
        try { audioContext.close(); } catch(e){}
        audioContext = null;
    }
    gateGainNode = null;
    analyser = null;

    // Tüm WebRTC bağlantılarını kapat
    peerConnections.forEach((pc, id) => {
        pc.close();
    });
    peerConnections.clear();
    audioContainer.innerHTML = '';

    // Sunucuya ayrıldığımızı bildir
    socket.emit('leave-voice');

    if (window.Android) {
        try { window.Android.onVoiceLeft(); } catch(e){}
    }

    // UI'ı güncelle
    voiceStatusBox.style.display = 'none';
    btnJoinVoice.style.display = 'block';
    btnLeaveVoice.style.display = 'none';
    voiceGrid.innerHTML = '';
}

// Odaya katıldığımızda içeride olan diğer üyeler geldiğinde
socket.on('voice-peers', async (existingPeers) => {
    for (const peer of existingPeers) {
        renderRemoteVoiceTile(peer);
        // Yeni katılan biz olduğumuz için diğerlerine biz teklif (offer) gönderiyoruz
        createPeerConnection(peer.id, true);
    }
});

// Biz içerideyken başka biri sese katıldığında
socket.on('peer-joined-voice', (peer) => {
    Sounds.join();
    renderRemoteVoiceTile(peer);
    // Karşı taraf bize offer gönderecek
    createPeerConnection(peer.id, false);
});

// Birisi sesten ayrıldığında
socket.on('peer-left-voice', ({ id, username }) => {
    Sounds.leave();
    removePeerConnection(id);
});

// WebRTC Sinyalleşmesi
socket.on('webrtc-signal', async ({ from, signal }) => {
    let pc = peerConnections.get(from);
    if (!pc) {
        pc = createPeerConnection(from, false);
    }

    try {
        if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit('webrtc-signal', {
                to: from,
                signal: { type: 'answer', sdp: pc.localDescription }
            });
        } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    } catch (err) {
        console.error('WebRTC sinyal hatasi:', err);
    }
});

// WebRTC Peer Bağlantısı Oluşturucu
function createPeerConnection(peerId, isInitiator) {
    if (peerConnections.has(peerId)) {
        return peerConnections.get(peerId);
    }

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.set(peerId, pc);

    // Yerel mikrofon parçalarını bağlantıya ekle
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // ICE Adaylarını sunucu üzerinden karşı tarafa ilet
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-signal', {
                to: peerId,
                signal: { candidate: event.candidate }
            });
        }
    };

    // Karşı taraftan gelen ses akışı
    pc.ontrack = (event) => {
        console.log(`[🔊] ${peerId} icin ses akisi alindi.`);
        let audioEl = document.getElementById(`audio-${peerId}`);
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = `audio-${peerId}`;
            audioEl.autoplay = true;
            audioContainer.appendChild(audioEl);
        }
        audioEl.srcObject = event.streams[0];
        if (isDeafened) audioEl.volume = 0;
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            removePeerConnection(peerId);
        }
    };

    // Eğer teklifi başlatan biz isek (yeni girdik ve eski üyelere bağlanıyoruz)
    if (isInitiator) {
        pc.onnegotiationneeded = async () => {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('webrtc-signal', {
                    to: peerId,
                    signal: { type: 'offer', sdp: pc.localDescription }
                });
            } catch (err) {
                console.error('Offer olusturma hatasi:', err);
            }
        };
    }

    return pc;
}

function removePeerConnection(peerId) {
    const pc = peerConnections.get(peerId);
    if (pc) {
        pc.close();
        peerConnections.delete(peerId);
    }

    const audioEl = document.getElementById(`audio-${peerId}`);
    if (audioEl) audioEl.remove();

    const tile = document.getElementById(`voice-tile-${peerId}`);
    if (tile) tile.remove();
}

// ==========================================
// 5. SES İŞLEME, GÜRÜLTÜ KAPISI (VAD) & YEŞİL HALKA
// ==========================================
function startVoiceProcessing() {
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let wasSpeaking = false;
    let lastSpokeTime = Date.now();

    vadInterval = setInterval(() => {
        if (!isInVoice || isMuted) {
            if (wasSpeaking) {
                wasSpeaking = false;
                setSpeaking('me', false);
                socket.emit('speaking-state', { isSpeaking: false });
                if (window.Android) {
                    try { window.Android.onSpeakingChanged(false); } catch(e){}
                }
            }
            if (gateGainNode && audioContext) {
                gateGainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.02);
            }
            return;
        }

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        // Eşik değeri: 9 üstü konuşma kabul edilir (daha hassas, fısıltı ve kelime sonlarını yutmaz)
        const isSpeakingNow = average > 9;

        // Akıllı Gürültü Kapısı (Noise Gate) + Konuşma Bırakma Gecikmesi (Hangover):
        if (isNoiseSuppression && gateGainNode && audioContext) {
            if (isSpeakingNow) {
                lastSpokeTime = Date.now();
                // Konuşma algılandı: kapıyı hemen aç
                gateGainNode.gain.setTargetAtTime(1.0, audioContext.currentTime, 0.02);
            } else {
                // Konuşma bittikten sonra 450ms boyunca açık tut (kelime sonları ve hafif sesler yutulmasın)
                if (Date.now() - lastSpokeTime < 450) {
                    gateGainNode.gain.setTargetAtTime(1.0, audioContext.currentTime, 0.02);
                } else {
                    gateGainNode.gain.setTargetAtTime(0.0, audioContext.currentTime, 0.12);
                }
            }
        } else if (gateGainNode && audioContext) {
            gateGainNode.gain.setTargetAtTime(1.0, audioContext.currentTime, 0.02);
        }

        const isStillHoldingVoice = isSpeakingNow || (Date.now() - lastSpokeTime < 450);

        if (isStillHoldingVoice !== wasSpeaking) {
            wasSpeaking = isStillHoldingVoice;
            setSpeaking('me', isStillHoldingVoice);
            socket.emit('speaking-state', { isSpeaking: isStillHoldingVoice });
            if (window.Android) {
                try { window.Android.onSpeakingChanged(isStillHoldingVoice); } catch(e){}
            }
        }
    }, 40);
}

// Başka birinin konuşma durumu
socket.on('peer-speaking', ({ id, isSpeaking }) => {
    setSpeaking(id, isSpeaking);
});

function setSpeaking(id, isSpeaking) {
    const tile = document.getElementById(`voice-tile-${id}`);
    if (tile) {
        if (isSpeaking) {
            tile.classList.add('speaking');
        } else {
            tile.classList.remove('speaking');
        }
    }

    const subItem = document.getElementById(`sub-voice-${id}`);
    if (subItem) {
        if (isSpeaking) {
            subItem.classList.add('speaking');
        } else {
            subItem.classList.remove('speaking');
        }
    }
}

// ==========================================
// 6. MİKROFON, KULAKLIK & GÜRÜLTÜ ENGELLEME BUTONLARI
// ==========================================
btnToggleMic.addEventListener('click', toggleMute);
btnToggleDeaf.addEventListener('click', toggleDeafen);

if (btnToggleNoise) {
    btnToggleNoise.addEventListener('click', toggleNoiseSuppression);
}

function toggleNoiseSuppression() {
    isNoiseSuppression = !isNoiseSuppression;

    if (isNoiseSuppression) {
        Sounds.unmute();
        btnToggleNoise.classList.add('active-feature');
        btnToggleNoise.classList.remove('disabled-feature');
        btnToggleNoise.title = 'Gürültü Engelleme (Açık)';
    } else {
        Sounds.mute();
        btnToggleNoise.classList.remove('active-feature');
        btnToggleNoise.classList.add('disabled-feature');
        btnToggleNoise.title = 'Gürültü Engelleme (Kapalı)';
        if (gateGainNode && audioContext) {
            gateGainNode.gain.setTargetAtTime(1.0, audioContext.currentTime, 0.01);
        }
    }
}

function toggleMute() {
    isMuted = !isMuted;

    if (rawLocalStream) {
        rawLocalStream.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });
    }
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });
    }

    if (isMuted) {
        Sounds.mute();
        btnToggleMic.classList.add('muted');
        btnToggleMic.title = 'Mikrofonu Aç';
    } else {
        Sounds.unmute();
        btnToggleMic.classList.remove('muted');
        btnToggleMic.title = 'Mikrofonu Kapat';
    }

    updateMyVoiceTileBadges();
    socket.emit('voice-state-update', { isMuted, isDeafened });

    if (window.Android) {
        try { window.Android.onMuteChanged(isMuted); } catch(e){}
    }
}

function toggleDeafen() {
    isDeafened = !isDeafened;

    // Sağırlaştırıldığında mikrofon da otomatik kapanır
    if (isDeafened) {
        Sounds.mute();
        btnToggleDeaf.classList.add('deafened');
        btnToggleDeaf.title = 'Sağırlaştırmayı Kaldır';
        if (!isMuted) toggleMute();

        // Gelen tüm sesleri kapat
        audioContainer.querySelectorAll('audio').forEach(a => a.volume = 0);
    } else {
        Sounds.unmute();
        btnToggleDeaf.classList.remove('deafened');
        btnToggleDeaf.title = 'Sağırlaştır';
        if (isMuted) toggleMute();

        // Gelen sesleri aç
        audioContainer.querySelectorAll('audio').forEach(a => a.volume = 1);
    }

    updateMyVoiceTileBadges();
    socket.emit('voice-state-update', { isMuted, isDeafened });

    if (window.Android) {
        try { window.Android.onMuteChanged(isMuted); } catch(e){}
    }
}

socket.on('peer-state-changed', ({ id, isMuted, isDeafened }) => {
    const tile = document.getElementById(`voice-tile-${id}`);
    if (tile) {
        const badgeBox = tile.querySelector('.voice-tile-badges');
        if (badgeBox) {
            badgeBox.innerHTML = '';
            if (isMuted || isDeafened) {
                badgeBox.innerHTML = `<span class="badge-muted">🔇</span>`;
            }
        }
    }
});

function updateMyVoiceTileBadges() {
    const myTile = document.getElementById('voice-tile-me');
    if (myTile) {
        const badgeBox = myTile.querySelector('.voice-tile-badges');
        if (badgeBox) {
            badgeBox.innerHTML = '';
            if (isMuted || isDeafened) {
                badgeBox.innerHTML = `<span class="badge-muted">🔇</span>`;
            }
        }
    }
}

// ==========================================
// 7. ARAYÜZ LİSTELERİ & GÖRSEL KARTLAR
// ==========================================
function renderLocalVoiceTile() {
    if (!currentUser) return;
    let myTile = document.getElementById('voice-tile-me');
    if (myTile) return;

    const div = document.createElement('div');
    div.className = 'voice-tile';
    div.id = 'voice-tile-me';
    div.innerHTML = `
        <div class="voice-tile-avatar" style="background-color: ${currentUser.color}">
            ${currentUser.username.charAt(0).toUpperCase()}
        </div>
        <div class="voice-tile-name">
            <span>${escapeHtml(currentUser.username)} (Sen)</span>
        </div>
        <div class="voice-tile-badges">
            ${isMuted ? '<span class="badge-muted">🔇</span>' : ''}
        </div>
    `;
    voiceGrid.appendChild(div);
}

function renderRemoteVoiceTile(peer) {
    if (document.getElementById(`voice-tile-${peer.id}`)) return;

    const div = document.createElement('div');
    div.className = 'voice-tile';
    div.id = `voice-tile-${peer.id}`;
    div.innerHTML = `
        <div class="voice-tile-avatar" style="background-color: ${peer.color || '#5865F2'}">
            ${(peer.username || '?').charAt(0).toUpperCase()}
        </div>
        <div class="voice-tile-name">
            <span>${escapeHtml(peer.username)}</span>
        </div>
        <div class="voice-tile-badges">
            ${peer.isMuted ? '<span class="badge-muted">🔇</span>' : ''}
        </div>
    `;
    voiceGrid.appendChild(div);
}

function updateMembersList(users) {
    membersList.innerHTML = '';
    onlineCount.textContent = users.length;

    users.forEach(u => {
        const isSelf = currentUser && u.id === currentUser.id;
        const div = document.createElement('div');
        div.className = 'member-item';
        div.innerHTML = `
            <div class="member-avatar" style="background-color: ${u.color || '#5865F2'}">
                ${(u.username || '?').charAt(0).toUpperCase()}
                <span class="status-indicator online"></span>
            </div>
            <span class="member-name">${escapeHtml(u.username)}${isSelf ? ' (Sen)' : ''}</span>
            ${u.inVoice ? '<span class="member-badge-voice">Seste</span>' : ''}
        `;
        membersList.appendChild(div);
    });
}

socket.on('voice-channel-update', (voiceMembers) => {
    updateVoiceUI(voiceMembers);
});

function updateVoiceUI(voiceMembers) {
    voiceCountBadge.textContent = voiceMembers.length;
    voiceTabCount.textContent = voiceMembers.length;

    voiceUserSublist.innerHTML = '';
    voiceMembers.forEach(vm => {
        const isMe = currentUser && vm.id === currentUser.id;
        const div = document.createElement('div');
        div.className = 'voice-sub-item';
        div.id = `sub-voice-${isMe ? 'me' : vm.id}`;
        div.innerHTML = `
            <div class="sub-avatar" style="background-color: ${vm.color || '#5865F2'}">
                ${(vm.username || '?').charAt(0).toUpperCase()}
            </div>
            <span>${escapeHtml(vm.username)}</span>
            ${vm.isMuted ? '<span style="font-size:11px; margin-left:auto;">🔇</span>' : ''}
        `;
        voiceUserSublist.appendChild(div);
    });
}
