# Auto-Update Kurulumu

Bu proje **electron-updater** kullanarak GitHub Releases üzerinden otomatik güncelleme yapabilir.

## Kurulum Adımları

### 1. GitHub Repository Ayarları

1. `package.json` dosyasında `GITHUB_USERNAME` kısmını kendi GitHub kullanıcı adınla değiştir:
   ```json
   "publish": {
     "provider": "github",
     "owner": "GITHUB_USERNAME",  // ← Burası senin kullanıcı adın olacak
     "repo": "dubme"
   }
   ```

### 2. GitHub Token Oluştur

1. GitHub'da Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
2. `repo` scope'unu seç
3. Token'ı kopyala ve güvenli bir yerde sakla

### 3. Token'ı Environment Variable Olarak Ayarla

**Windows (PowerShell):**
```powershell
$env:GH_TOKEN="your_token_here"
```

**Windows (Kalıcı - System Properties):**
- System Properties → Environment Variables → New
- Variable name: `GH_TOKEN`
- Variable value: `your_token_here`

### 4. Versiyon Güncelleme ve Build

1. `package.json` dosyasında version'ı güncelle:
   ```json
   "version": "1.0.1"
   ```

2. Build al:
   ```bash
   npm run build
   ```

3. Build dosyalarını GitHub Release olarak yükle:
   ```bash
   # electron-builder otomatik olarak GitHub'a yükleyecek
   npm run build -- --publish always
   ```

### 5. Manuel Release (Opsiyonel)

Eğer manuel release yapmak istersen:

1. GitHub repository'de Releases → Create a new release
2. Tag version: `v1.0.1` (package.json'daki version ile aynı olmalı)
3. Release title: `v1.0.1`
4. `dist/` klasöründeki dosyaları yükle:
   - `DubMe Setup 1.0.1.exe` (installer)
   - `latest.yml` (güncelleme metadata dosyası - ÇOK ÖNEMLİ!)

## Nasıl Çalışır?

1. Uygulama her açıldığında GitHub Releases'ı kontrol eder
2. Yeni versiyon varsa otomatik indirir
3. Kullanıcıya bildirim gösterir
4. Kullanıcı "Yeniden Başlat" derse güncellemeleri kurar

## Test

1. İlk versiyonu build al ve GitHub'a yükle (örn: v1.0.0)
2. Uygulamayı kur ve çalıştır
3. `package.json`'da version'ı artır (v1.0.1)
4. Yeni build al ve GitHub'a yükle
5. Eski versiyon otomatik güncellemeyi görecek

## Önemli Notlar

- **`latest.yml` dosyası çok önemli!** Her release'de mutlaka yüklenmelidir
- Version numaraları semantic versioning kullanmalı (1.0.0, 1.0.1, 1.1.0, vs.)
- Production build'de auto-updater çalışır, development'ta çalışmaz
- İlk kurulumda güncelleyici yoktur, sadece 2. ve sonraki versiyonlarda çalışır
