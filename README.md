# 🎮 Discord Web - Metin & Ses Kanalı Sunucusu

Discord benzeri karanlık temalı, tek bir sunucu içinde **#genel-sohbet** metin kanalı ve **🔊 Genel Ses** odası bulunan, tarayıcı (Chrome vb.) üzerinden çalışan WebRTC sesli sohbet uygulaması.

---

## 🚀 Özellikler

- **Discord Teması**: Birebir Discord karanlık teması, renk paleti, butonlar ve kanal yapısı.
- **Tek Metin Kanalı (#genel-sohbet)**: Gerçek zamanlı mesajlaşma, link paylaşımı, mesaj geçmişi ve Discord bildirim sesi.
- **Tek Ses Kanalı (🔊 Genel Ses)**:
  - **WebRTC Mesh**: Sıfır gecikmeli, P2P yüksek ses kalitesi (Google STUN destekli).
  - **Konuşma Göstergesi (VAD)**: Biri konuştuğunda profilinin etrafında Discord tarzı yeşil halka yanıp söner.
  - **Mikrofon Sustur (Mute)** & **Kulaklık Kapat (Deafen)** butonları.
  - Odaya giriş/çıkış ve susturma sentetik ses efektleri (harici dosya indirmeden çalışır).
- **Çevrimiçi Üyeler**: Sağ tarafta anlık sunucuda olan kullanıcılar ve kimlerin seste olduğu görünür.
- **Her Ortamda Çalışır**: Windows, Linux VPS, Docker, macOS.

---

## 💻 1. Kendi Bilgisayarında Hemen Çalıştırma (Windows)

1. Klasördeki **`start.bat`** dosyasına çift tıkla.
2. Tarayıcında (Chrome, Edge vb.) şu adrese gir:
   👉 **`http://localhost:3000`**
3. İsmini yazıp gir, mikrofona izin ver ve konuşmaya başla!
4. Aynı Wi-Fi / yerel ağdaki arkadaşlarınla test etmek için konsolda yazan yerel IP adresini (Örn: `http://192.168.1.35:3000`) paylaşabilirsin.

---

## 🌐 2. Uzak Sunucuda (Linux VPS / Ubuntu / Debian) Çalıştırma

Sunucunda (Ubuntu/Debian) çalıştırmak için:

```bash
# 1. Klasörü sunucuna yükle ve içine gir
cd discord-web

# 2. Node.js ve NPM kurulu değilse kur:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Bağımlılıkları yükle
npm install

# 4. Sunucuyu arka planda sürekli açık tutmak için (PM2):
sudo npm install -g pm2
pm2 start server.js --name "discord-web"
pm2 save
pm2 startup
```

### Docker ile Çalıştırma:
```bash
docker compose up -d --build
```

---

## 🔒 ÖNEMLİ: Chrome ve WebRTC Mikrofon Güvenliği (HTTPS)

Google Chrome ve tüm modern tarayıcılar, kullanıcı gizliliği gereği mikrofona erişim iznini **yalnızca iki durumda** verir:
1. `http://localhost:3000` (Kendi bilgisayarında test ederken sorunsuz çalışır).
2. **HTTPS** (`https://...`) ile korunan sitelerde.

İnternet üzerindeki bir sunucuya kurduğunda arkadaşların `http://IP:3000` ile girdiğinde Chrome mikrofon izni vermeyebilir. Bunu çözmenin en pratik 2 yolu:

### Yöntem A: Cloudflare Tunnel (1 Dakikada Ücretsiz HTTPS - Önerilen!)
Hiçbir port açmadan veya SSL sertifikası ayarlamadan anında bedava HTTPS adresi almak için:
1. Bilgisayarında veya sunucunda [Cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)'i indir.
2. Şu komutu çalıştır:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. Sana `https://rasgele-isim.trycloudflare.com` şeklinde bir link verecektir. Bu linki arkadaşlarına attığında Chrome mikrofona anında izin verir ve herkes sesli kanala girebilir!

### Yöntem B: Caddy veya Nginx ile Otomatik SSL
Kendi alan adın (domain) varsa Caddy ile tek satırda ücretsiz SSL açabilirsin:
```caddy
senindomain.com {
    reverse_proxy localhost:3000
}
```

---

## 📁 Dosya Yapısı

```
discord-web/
├── public/
│   ├── index.html     # Discord web arayüzü
│   ├── style.css      # Discord koyu tema ve animasyonlar
│   └── app.js         # WebRTC ses akışı, Socket.io istemcisi, VAD ses tespiti
├── server.js          # Express sunucusu & Socket.io sinyalleşme
├── package.json       # Proje bağımlılıkları (Express, Socket.io)
├── Dockerfile         # Docker imajı
├── docker-compose.yml # Tek tıkla Docker ayağa kaldırma
├── start.bat          # Windows tek tıkla başlatma kısayolu
└── README.md          # Kurulum ve kullanım rehberi
```
