# 🚀 Hızlı Başlangıç

## Uygulamayı Başlatma

```powershell
npm start
```

Ya da geliştirme modunda (DevTools açık):
```powershell
npm run dev
```

## İlk Kullanım - Adım Adım

### 1️⃣ API Key Ekleyin

1. Uygulamayı başlatın
2. Sağ üstteki **⚙️ Ayarlar** butonuna tıklayın
3. **+ API Key Ekle** butonuna tıklayın
4. ElevenLabs API key'inizi yapıştırın
5. **Kaydet** butonuna basın

> **API Key nereden alınır?**
> Ayarlar penceresindeki **?** işaretine tıklayarak doğrudan ElevenLabs API sayfasına gidebilirsiniz.

### 2️⃣ Video Ekleyin

3 farklı yöntemle video ekleyebilirsiniz:

**Yöntem 1: Dosya Seçici**
- "Dosya Seç" butonuna tıklayın
- Bilgisayarınızdan video dosyasını seçin

**Yöntem 2: Sürükle-Bırak**
- Video dosyanızı doğrudan pencereye sürükleyin ve bırakın

**Yöntem 3: YouTube Link**
- YouTube video URL'ini metin kutusuna yapıştırın

### 3️⃣ Dil Ayarlarını Yapın

- **Video Dili:** Orijinal videonun dilini seçin (Varsayılan: Türkçe)
- **Dublaj Dili:** Çevrilmesini istediğiniz dili seçin (Varsayılan: Almanca)
- **Konuşmacı Sayısı:** Videodaki farklı konuşmacı sayısını girin (Varsayılan: 1)

### 4️⃣ Kredi Kontrolü

Video eklendiğinde otomatik olarak:
- ✅ Toplam API limitiniz görüntülenir
- ✅ İşlem için gereken kredi miktarı hesaplanır
- ✅ Yetersiz kredi varsa uyarı alırsınız

### 5️⃣ Dublajı Başlatın

1. **"Dublaj Başlat"** butonuna tıklayın
2. Video otomatik olarak parçalara bölünür
3. Her parça için ilerleme durumunu görebilirsiniz
4. Tüm parçalar tamamlandıktan sonra birleştirilir
5. Kaydetme konumunu seçin
6. ✨ Tamamlandı!

## 💡 İpuçları

### Birden Fazla API Key Kullanımı

- Uzun videolar için birden fazla API key ekleyebilirsiniz
- Video otomatik olarak her key'in limitine göre bölünür
- Tüm parçalar paralel işlenir, bu da çok daha hızlı sonuç almanızı sağlar

### API Key Arşivleme

- Geçici olarak kullanmak istemediğiniz API key'leri arşivleyebilirsiniz
- Arşivlenen key'ler işlemlerde kullanılmaz
- "Geri Al" butonu ile istediğiniz zaman tekrar aktif edebilirsiniz

### Kredi Tasarrufu

- API key'lerinizin limitlerini düzenli kontrol edin (ayarlar açıldığında otomatik güncellenir)
- Kısa test videoları ile önce deneme yapın

### Tema Değiştirme

- Sağ üstteki **🌙/☀️** butonuyla dark/light tema arasında geçiş yapabilirsiniz

## ⚠️ Dikkat Edilmesi Gerekenler

1. **FFmpeg Gerekli:** FFmpeg'in sisteminizde kurulu ve PATH'te olduğundan emin olun
2. **İnternet Bağlantısı:** API çağrıları için stabil internet gereklidir
3. **Video Uzunluğu:** Çok uzun videolar için yeterli API limitiniz olduğundan emin olun
4. **Dosya Yolu:** Video dosya yolunda Türkçe karakter varsa sorun yaşayabilirsiniz

## 🐛 Sorun mu Yaşıyorsunuz?

### Uygulama Açılmıyor
```powershell
# Node modules'i yeniden yükleyin
rm -rf node_modules
npm install
npm start
```

### FFmpeg Hatası
```powershell
# FFmpeg'in kurulu olup olmadığını kontrol edin
ffmpeg -version
```

### API Key Çalışmıyor
- API key'in doğru kopyalandığından emin olun
- ElevenLabs hesabınızın aktif olduğunu kontrol edin
- İnternet bağlantınızı kontrol edin

### Video Yüklenmiyor
- Video formatının desteklendiğinden emin olun (MP4, AVI, MOV, MKV, WEBM)
- Dosya yolunda özel karakter olmamasına dikkat edin
- Dosyanın bozuk olmadığını kontrol edin

## 📞 Daha Fazla Yardım

Detaylı bilgi için `README.md` dosyasını okuyun.
