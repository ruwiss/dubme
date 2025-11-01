# DubMe - Video Dublajlayıcı

ElevenLabs API kullanarak videolarınızı farklı dillere ücretsiz dublajlayın.

## Özellikler

- 🎬 **Video Dublaj**: Videolarınızı 29+ dilde dublajlayın
- 🎵 **Ses Birleştirme**: Video ve ses dosyalarını birleştirin
- 📹 **YouTube Desteği**: YouTube videolarını direkt indirip dublajlayın
- 🔧 **Segment Düzenleme**: Videoları parçalara ayırıp ayrı ayrı dublajlayın
- 🔑 **Çoklu API Key**: Birden fazla ElevenLabs API anahtarı kullanın
- 🔄 **Otomatik Güncelleme**: Yeni sürümler otomatik olarak güncellenir

## Kurulum

1. [Releases](https://github.com/ruwiss/dubme/releases) sayfasından en son sürümü indirin
2. `DubMe Setup.exe` dosyasını çalıştırın
3. Kurulum tamamlandıktan sonra uygulamayı başlatın
4. Ayarlar bölümünden ElevenLabs API anahtarlarınızı ekleyin

## ElevenLabs API Key Nasıl Alınır?

1. [ElevenLabs](https://elevenlabs.io/) sitesine kaydolun
2. Hesap ayarlarından API anahtarınızı kopyalayın
3. Uygulamada Ayarlar → API Anahtarları bölümüne ekleyin

> **Not:** Ücretsiz hesaplar ayda 10,000 karakter limiti ile gelir.

## Teknolojiler

- Electron
- FFmpeg
- yt-dlp
- ElevenLabs API

## Lisans

MIT

# DubMe - Video Dublaj Uygulaması

Electron.js tabanlı modern video dublaj uygulaması. ElevenLabs API kullanarak videolarınızı farklı dillere çevirir.

## Özellikler

- 🎬 Video dosyası seçme veya sürükle-bırak
- 🔗 YouTube video desteği
- 🌍 Çoklu dil desteği (Türkçe, İngilizce, Almanca, Fransızca, İspanyolca)
- 🔑 Çoklu API key yönetimi
- 📊 Otomatik kredi hesaplama ve limit kontrolü
- 🎯 API limitine göre akıllı video bölme
- ⚡ Paralel işleme
- 🎨 Modern dark/light tema
- 📥 Otomatik indirme ve birleştirme

## Gereksinimler

- Node.js (v16 veya üzeri)
- npm
- FFmpeg (sistem PATH'inde olmalı)
- ElevenLabs API Key

## Kurulum

### 1. Bağımlılıkları Yükle

```bash
npm install
```

### 2. FFmpeg Kurulumu

#### Windows için:
1. [FFmpeg resmi sitesinden](https://www.ffmpeg.org/download.html) indirin
2. İndirilen dosyayı bir klasöre çıkarın
3. FFmpeg bin klasörünü sistem PATH'ine ekleyin

```powershell
# PowerShell ile PATH'e ekleme
$env:PATH += ";C:\path\to\ffmpeg\bin"
```

### 3. Uygulamayı Başlat

```bash
npm start
```

Geliştirme modunda çalıştırmak için (DevTools açık):
```bash
npm run dev
```

## Kullanım

### 1. API Key Ekleme

1. Sağ üst köşedeki ayarlar butonuna (⚙️) tıklayın
2. "API Anahtarları" bölümünde "+ API Key Ekle" butonuna tıklayın
3. ElevenLabs API key'inizi girin
4. Otomatik olarak kalan limitiniz kontrol edilecektir

**API Key almak için:** Soru işareti (?) butonuna tıklayarak doğrudan [ElevenLabs API sayfasına](https://elevenlabs.io/app/developers/api-keys) gidebilirsiniz.

### 2. Video Ekleme

Üç yöntemle video ekleyebilirsiniz:
- **Dosya Seçici:** "Dosya Seç" butonuna tıklayın
- **Sürükle-Bırak:** Video dosyasını doğrudan kutuya sürükleyin
- **YouTube:** YouTube video linkini girin

### 3. Ayarları Yapın

- **Video Dili:** Kaynak videonun dilini seçin (Varsayılan: Türkçe)
- **Dublaj Dili:** Çevrilecek dili seçin (Varsayılan: Almanca)
- **Konuşmacı Sayısı:** Videodaki konuşmacı sayısını belirtin (Varsayılan: 1)

### 4. Kredi Kontrolü

Video eklendikten sonra otomatik olarak:
- Toplam API limitiniz gösterilir
- Gerekli kredi miktarı hesaplanır
- Krediniz yeterli mi kontrol edilir

**Kredi Hesaplama:**
- 30 saniye = 1000 kredi
- 1 dakika = 2000 kredi

### 5. Dublaj İşlemi

1. "Dublaj Başlat" butonuna tıklayın
2. Video otomatik olarak API limitine göre parçalara bölünür
3. Parçalar paralel olarak işlenir
4. İlerleme canlı olarak gösterilir
5. İşlem tamamlandığında dosyalar otomatik birleştirilir
6. Kaydetme konumunu seçin

## API Key Yönetimi

### Arşivleme
- Geçici olarak kullanmak istemediğiniz API key'leri arşivleyebilirsiniz
- Arşivlenen key'ler işlemlerde kullanılmaz
- İstediğiniz zaman geri alabilirsiniz

### Limit Kontrol
- Ayarlar açıldığında tüm API key'lerin limitleri otomatik güncellenir
- Her key için kalan kredi miktarı gösterilir

## Proje Yapısı

```
dubme/
├── src/
│   ├── main/
│   │   └── main.js              # Electron main process
│   ├── renderer/
│   │   ├── index.html          # Ana HTML
│   │   ├── styles.css          # Stiller
│   │   └── renderer.js         # UI mantığı
│   └── features/
│       └── dubbing/
│           ├── elevenlabs-service.js  # ElevenLabs API
│           └── video-utils.js         # Video işleme
├── package.json
└── README.md
```

## Geliştirme Notları

### Modüler Yapı
Proje gelecekte eklenecek özellikler için modüler bir yapıya sahiptir:
- `src/features/` altında her özellik ayrı klasörde
- Şu an sadece `dubbing` özelliği implement edilmiş
- Yeni özellikler kolayca eklenebilir

### Tema Sistemi
- CSS değişkenleri ile dark/light tema desteği
- Tema tercihi otomatik kaydedilir
- Kolay özelleştirme

### Video Bölme Algoritması
1. Gerekli toplam kredi hesaplanır
2. API key'ler limite göre sıralanır (büyükten küçüğe)
3. Her key'in limiti oranında video bölünür
4. Range parametreleri ile API'ye gönderilir

## Sorun Giderme

### FFmpeg Hatası
```
Error: ffprobe ENOENT
```
**Çözüm:** FFmpeg'in PATH'e eklendiğinden emin olun.

### API Key Hatası
```
API key doğrulanamadı
```
**Çözüm:** 
- API key'in doğru girildiğinden emin olun
- Internet bağlantınızı kontrol edin
- ElevenLabs hesabınızın aktif olduğundan emin olun

### Video Süresi Alınamıyor
**Çözüm:**
- Video formatının desteklendiğinden emin olun
- Dosya yolunda Türkçe karakter olmamasına dikkat edin

## Katkıda Bulunma

Bu proje açık kaynak geliştirmeye açıktır. Pull request'ler memnuniyetle karşılanır.

## Lisans

MIT

## İletişim

Sorularınız için issue açabilirsiniz.
