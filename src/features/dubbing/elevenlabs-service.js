const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const fs = require('fs');
const path = require('path');

class ElevenLabsService {
  constructor() {
    this.clients = {}; // API key başına client cache
  }
  
  getClient(apiKey) {
    if (!this.clients[apiKey]) {
      this.clients[apiKey] = new ElevenLabsClient({ apiKey });
    }
    return this.clients[apiKey];
  }

  async getSubscriptionInfo(apiKey) {
    try {
      const client = this.getClient(apiKey);
      // SDK'da user.get() kullanılıyor
      const userInfo = await client.user.get();
      
      // Tüm response'u logla
      console.log('User info response:', JSON.stringify(userInfo, null, 2));
      
      // SDK response'undan subscription bilgisini al
      const subscription = userInfo.subscription || userInfo;
      
      const characterLimit = subscription.character_limit || subscription.characterLimit || 0;
      const characterCount = subscription.character_count || subscription.characterCount || 0;
      const remainingCharacters = characterLimit - characterCount;
      
      console.log('Parsed values:', { characterLimit, characterCount, remainingCharacters });
      
      return {
        success: true,
        remainingLimit: remainingCharacters,
        totalLimit: characterLimit,
        used: characterCount
      };
    } catch (error) {
      console.error('Subscription bilgisi hatası:', error);
      return {
        success: false,
        error: error.message,
        remainingLimit: 0
      };
    }
  }

  cleanYouTubeUrl(url) {
    // YouTube URL'ini temizle - sadece video ID'yi tut
    try {
      const urlObj = new URL(url);
      const videoId = urlObj.searchParams.get('v');
      
      if (videoId) {
        // Temiz URL oluştur
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
      
      // Shorts URL'i için
      if (url.includes('/shorts/')) {
        const match = url.match(/\/shorts\/([^&\/?#]+)/);
        if (match && match[1]) {
          return `https://www.youtube.com/watch?v=${match[1]}`;
        }
      }
      
      return url;
    } catch (error) {
      console.error('URL temizleme hatası:', error);
      return url;
    }
  }

  async dubVideo(apiKey, videoFile, sourceLang, targetLang, numSpeakers, rangeStart = null, rangeEnd = null, retryCount = 0) {
    const MAX_RETRIES = 2;
    
    try {
      console.log('dubVideo parametreleri:', { 
        videoFile: typeof videoFile === 'string' ? videoFile.substring(0, 50) : 'file',
        sourceLang, 
        targetLang, 
        numSpeakers, 
        rangeStart, 
        rangeEnd,
        retryCount
      });
      
      const client = this.getClient(apiKey);
      
      const dubbingParams = {
        targetLang: targetLang,
        numSpeakers: numSpeakers,
        watermark: true // Ücretsiz hesaplar için gerekli
      };
      
      // Source lang ekle (opsiyonel)
      if (sourceLang) {
        dubbingParams.sourceLang = sourceLang;
      }
      
      // Range parametreleri (API integer bekliyor)
      if (rangeStart !== null) {
        dubbingParams.startTime = Math.floor(rangeStart);
      }
      if (rangeEnd !== null) {
        dubbingParams.endTime = Math.ceil(rangeEnd);
      }
      
      // Video dosyası veya URL
      if (typeof videoFile === 'string' && videoFile.startsWith('http')) {
        // YouTube URL'ini temizle
        const cleanUrl = this.cleanYouTubeUrl(videoFile);
        console.log('Temizlenmiş URL:', cleanUrl);
        dubbingParams.sourceUrl = cleanUrl;
      } else {
        // SDK için File benzeri obje oluştur
        const fileBuffer = fs.readFileSync(videoFile);
        const fileName = path.basename(videoFile);
        const ext = path.extname(videoFile).toLowerCase();
        
        // MIME type belirle
        const mimeTypes = {
          '.mp4': 'video/mp4',
          '.mov': 'video/quicktime',
          '.avi': 'video/x-msvideo',
          '.mkv': 'video/x-matroska',
          '.webm': 'video/webm',
          '.flv': 'video/x-flv'
        };
        const mimeType = mimeTypes[ext] || 'video/mp4';
        
        // Blob-like obje oluştur
        const blob = new Blob([fileBuffer], { type: mimeType });
        // File benzeri obje
        dubbingParams.file = Object.assign(blob, { 
          name: fileName,
          lastModified: Date.now()
        });
      }
      
      console.log('SDK dubbing parametreleri:', { ...dubbingParams, file: dubbingParams.file ? 'stream' : undefined });
      
      // SDK'nın create metodunu kullan
      const result = await client.dubbing.create(dubbingParams);
      
      console.log('Dubbing create response:', result);
      
      // dubbing_id veya dubbingId veya id olabilir
      const dubbingId = result.dubbing_id || result.dubbingId || result.id;
      
      console.log('Extracted dubbing ID:', dubbingId);
      
      return {
        success: true,
        dubbingId: dubbingId
      };
    } catch (error) {
      console.error('Dublaj API hatası:', error);
      
      // Eğer invalid_url hatası ise ve retry limiti aşılmamışsa tekrar dene
      if (retryCount < MAX_RETRIES && error.message && error.message.includes('invalid_url')) {
        console.log(`Retry ${retryCount + 1}/${MAX_RETRIES} - Invalid URL hatası, tekrar deneniyor...`);
        
        // 2 saniye bekle ve tekrar dene
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return this.dubVideo(apiKey, videoFile, sourceLang, targetLang, numSpeakers, rangeStart, rangeEnd, retryCount + 1);
      }
      
      return {
        success: false,
        error: error.message || 'Bilinmeyen hata'
      };
    }
  }

  async getDubbingStatus(apiKey, dubbingId) {
    try {
      const client = this.getClient(apiKey);
      // SDK'nın get metodunu kullan
      const result = await client.dubbing.get(dubbingId);

      return {
        success: true,
        status: result.status,
        targetLanguages: result.target_languages,
        metadata: result
      };
    } catch (error) {
      console.error('Dublaj status hatası:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async downloadDubbedAudio(apiKey, dubbingId, languageCode, audioOnly = false) {
    try {
      const client = this.getClient(apiKey);
      
      // SDK ile dublajlanmış dosyayı indir
      const stream = await client.dubbing.audio.get(dubbingId, languageCode);
      
      console.log('Stream tipi:', typeof stream, stream.constructor.name);
      
      // Eğer zaten Buffer ise direkt döndür
      if (Buffer.isBuffer(stream)) {
        return {
          success: true,
          data: stream
        };
      }
      
      // Web ReadableStream (SDK'dan dönen format)
      if (stream && typeof stream.getReader === 'function') {
        const reader = stream.getReader();
        const chunks = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        
        const buffer = Buffer.concat(chunks);
        return {
          success: true,
          data: buffer
        };
      }
      
      // Node.js Readable stream
      if (stream && typeof stream.on === 'function') {
        return new Promise((resolve, reject) => {
          const chunks = [];
          
          stream.on('data', (chunk) => {
            chunks.push(chunk);
          });
          
          stream.on('end', () => {
            const buffer = Buffer.concat(chunks);
            resolve({
              success: true,
              data: buffer
            });
          });
          
          stream.on('error', (error) => {
            reject(error);
          });
        });
      }
      
      // Diğer durumlar için hata
      throw new Error('Bilinmeyen stream formatı: ' + (stream ? stream.constructor.name : 'null'));
      
    } catch (error) {
      console.error('İndirme hatası:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  calculateRequiredCredits(durationInSeconds) {
    // 30 saniye = 1000 kredi
    // 1 dakika = 2000 kredi
    const creditsPerSecond = 2000 / 60; // ~33.33 kredi/saniye
    const requiredCredits = Math.ceil(durationInSeconds * creditsPerSecond);
    
    // Güvenlik için sadece yukarı yuvarla, fazla pay ekleme
    return requiredCredits;
  }

  splitVideoByCredits(durationInSeconds, apiKeys) {
    const totalRequired = this.calculateRequiredCredits(durationInSeconds);
    const MIN_SEGMENT_DURATION = 30; // Minimum 30 saniye
    const creditsPerSecond = 2000 / 60;
    
    // API keylerini limite göre sırala (büyükten küçüğe)
    const sortedKeys = [...apiKeys].sort((a, b) => b.remainingLimit - a.remainingLimit);
    
    // Toplam mevcut kredileri hesapla
    const totalAvailableCredits = sortedKeys.reduce((sum, k) => sum + k.remainingLimit, 0);
    
    console.log(`Video süresi: ${durationInSeconds}s, Gerekli kredi: ${totalRequired}, Mevcut kredi: ${totalAvailableCredits}`);
    
    // Eğer toplam kredi yetersizse hata
    if (totalAvailableCredits < totalRequired) {
      throw new Error(`Yetersiz kredi. Gerekli: ${totalRequired}, Mevcut: ${totalAvailableCredits}`);
    }
    
    // Eğer ilk API key tek başına yeterliyse bölme
    if (sortedKeys.length > 0 && sortedKeys[0].remainingLimit >= totalRequired) {
      console.log('Tek API key yeterli, bölme yapılmayacak');
      return [{
        apiKey: sortedKeys[0].key,
        rangeStart: 0,
        rangeEnd: durationInSeconds,
        duration: durationInSeconds,
        requiredCredits: totalRequired
      }];
    }
    
    // Kullanılabilir keyleri filtrele (minimum 30 saniye işleyebilen)
    const minCreditsFor30Sec = this.calculateRequiredCredits(MIN_SEGMENT_DURATION);
    const usableKeys = sortedKeys.filter(k => k.remainingLimit >= minCreditsFor30Sec);
    
    if (usableKeys.length === 0) {
      throw new Error(`Hiçbir API key minimum segment süresini (30 saniye = ${minCreditsFor30Sec} kredi) karşılayamıyor. Lütfen daha fazla kredi ekleyin.`);
    }
    
    console.log(`Kullanılabilir key sayısı: ${usableKeys.length}/${sortedKeys.length}`);
    
    // Eğer kullanılabilir key sayısı az ve video çok parçalanacaksa uyar
    const estimatedSegments = Math.ceil(totalRequired / usableKeys[0].remainingLimit);
    if (estimatedSegments > usableKeys.length + 1) {
      throw new Error(`Video çok fazla parçalanacak (${estimatedSegments} parça). Lütfen daha fazla API key ekleyin veya daha kısa bir video seçin.`);
    }
    
    // Çoklu key kullanımı gerekiyor - sadece kullanılabilir keyleri kullan
    const segments = [];
    let remainingDuration = durationInSeconds;
    let currentStart = 0;
    
    for (const key of usableKeys) {
      if (remainingDuration <= 0) break;
      
      // Bu key ile işlenebilecek maksimum süre (güvenlik payı olmadan)
      const maxDurationForThisKey = Math.floor(key.remainingLimit / creditsPerSecond);
      
      console.log(`Key: ${key.key.substring(0, 10)}..., Kredi: ${key.remainingLimit}, Max süre: ${maxDurationForThisKey}s, Kalan süre: ${remainingDuration}s`);
      
      // Bu key ile ne kadar işlenebilir hesapla
      let segmentDuration = Math.min(maxDurationForThisKey, remainingDuration);
      
      // Segment için gereken krediyi hesapla
      let segmentCredits = this.calculateRequiredCredits(segmentDuration);
      
      // Eğer segment kredisi key limitini aşıyorsa, süreyi ayarla
      if (segmentCredits > key.remainingLimit) {
        // Tam kullanılabilir süreyi hesapla
        segmentDuration = Math.floor(key.remainingLimit / creditsPerSecond);
        segmentCredits = this.calculateRequiredCredits(segmentDuration);
        console.log(`Segment süresi ayarlandı: ${segmentDuration}s (Kredi: ${segmentCredits})`);
      }
      
      // Eğer kalan süre minimum segmentten küçükse, son parçaya ekle
      if (remainingDuration < MIN_SEGMENT_DURATION && segments.length > 0) {
        // Son segmente ekle
        const lastSegment = segments[segments.length - 1];
        lastSegment.rangeEnd += remainingDuration;
        lastSegment.duration += remainingDuration;
        lastSegment.requiredCredits = this.calculateRequiredCredits(lastSegment.duration);
        break;
      }
      
      // Minimum segment süresinden küçük olmasın
      if (segmentDuration > 0 && segmentDuration >= MIN_SEGMENT_DURATION) {
        const finalCredits = this.calculateRequiredCredits(segmentDuration);
        
        segments.push({
          apiKey: key.key,
          rangeStart: currentStart,
          rangeEnd: currentStart + segmentDuration,
          duration: segmentDuration,
          requiredCredits: finalCredits
        });
        
        console.log(`Segment eklendi: ${currentStart}s - ${currentStart + segmentDuration}s (${finalCredits} kredi)`);
        
        currentStart += segmentDuration;
        remainingDuration -= segmentDuration;
      } else if (segmentDuration > 0 && remainingDuration === durationInSeconds) {
        // İlk segment ve 30 saniyeden küçük - yine de ekle (kısa video)
        const finalCredits = this.calculateRequiredCredits(segmentDuration);
        
        segments.push({
          apiKey: key.key,
          rangeStart: currentStart,
          rangeEnd: currentStart + segmentDuration,
          duration: segmentDuration,
          requiredCredits: finalCredits
        });
        
        currentStart += segmentDuration;
        remainingDuration -= segmentDuration;
      }
    }
    
    return segments;
  }
}

module.exports = new ElevenLabsService();
