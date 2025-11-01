const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Embedded binary paths with asar fix
let ffmpegPath = require('ffmpeg-static');
let ffprobePath = require('ffprobe-static').path;

// Fix paths for asar in production
if (ffmpegPath.includes('app.asar')) {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}
if (ffprobePath.includes('app.asar')) {
  ffprobePath = ffprobePath.replace('app.asar', 'app.asar.unpacked');
}

class VideoAnalyzer {
  /**
   * Video'dan ses çıkarır ve geçici dosyaya kaydeder
   */
  async extractAudio(videoPath) {
    const tempDir = os.tmpdir();
    const audioPath = path.join(tempDir, `audio_${Date.now()}.wav`);
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-i', videoPath,
        '-vn', // Video codec'i devre dışı bırak
        '-acodec', 'pcm_s16le', // WAV formatı
        '-ar', '44100', // Sample rate
        '-ac', '1', // Mono
        '-y', // Üzerine yaz
        audioPath
      ]);
      
      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(audioPath);
        } else {
          reject(new Error(`Audio extraction failed: ${stderr}`));
        }
      });
      
      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  /**
   * Waveform verisi oluşturur (amplitude değerleri)
   */
  async generateWaveform(audioPath, samples = 1000) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-i', audioPath,
        '-f', 'f32le', // 32-bit float PCM
        '-ac', '1', // Mono
        '-ar', '8000', // Düşük sample rate (yeterli görselleştirme için)
        '-'
      ]);
      
      let audioData = Buffer.alloc(0);
      
      ffmpeg.stdout.on('data', (data) => {
        audioData = Buffer.concat([audioData, data]);
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          // Float32 array'e dönüştür
          const floatArray = new Float32Array(
            audioData.buffer,
            audioData.byteOffset,
            audioData.length / 4
          );
          
          // Downsample: belirtilen sample sayısına düşür
          const step = Math.floor(floatArray.length / samples);
          const waveform = [];
          
          for (let i = 0; i < samples; i++) {
            const start = i * step;
            const end = Math.min(start + step, floatArray.length);
            
            // Bu aralıktaki max amplitude değerini al
            let max = 0;
            for (let j = start; j < end; j++) {
              max = Math.max(max, Math.abs(floatArray[j]));
            }
            
            waveform.push(max);
          }
          
          resolve(waveform);
        } else {
          reject(new Error('Waveform generation failed'));
        }
      });
      
      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  /**
   * Sessizlik anlarını tespit eder
   */
  async detectSilence(audioPath, duration, noiseThreshold = -40, minSilenceDuration = 0.5) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-i', audioPath,
        '-af', `silencedetect=noise=${noiseThreshold}dB:d=${minSilenceDuration}`,
        '-f', 'null',
        '-'
      ]);
      
      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        // Parse silence detection output
        const silences = [];
        const lines = stderr.split('\n');
        
        let currentSilence = {};
        
        lines.forEach(line => {
          // silence_start: 123.456
          const startMatch = line.match(/silence_start: ([\d.]+)/);
          if (startMatch) {
            currentSilence.start = parseFloat(startMatch[1]);
          }
          
          // silence_end: 125.678 | silence_duration: 2.222
          const endMatch = line.match(/silence_end: ([\d.]+)/);
          if (endMatch) {
            currentSilence.end = parseFloat(endMatch[1]);
            
            // Ortası kesim noktası önerisi olabilir
            currentSilence.middle = (currentSilence.start + currentSilence.end) / 2;
            
            silences.push({ ...currentSilence });
            currentSilence = {};
          }
        });
        
        resolve(silences);
      });
      
      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  /**
   * Video analizi yapar ve tüm verileri döndürür
   */
  async analyzeVideo(videoPath, duration) {
    try {
      console.log('Video analizi başlıyor:', videoPath);
      
      // 1. Ses çıkar
      console.log('Ses çıkarılıyor...');
      const audioPath = await this.extractAudio(videoPath);
      
      // 2. Waveform oluştur
      console.log('Waveform oluşturuluyor...');
      const waveform = await this.generateWaveform(audioPath, 1000);
      
      // 3. Sessizlik tespiti
      console.log('Sessizlik tespiti yapılıyor...');
      const silences = await this.detectSilence(audioPath, duration);
      
      // 4. Temp audio dosyasını sil
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
      
      console.log('Video analizi tamamlandı');
      console.log('- Waveform samples:', waveform.length);
      console.log('- Sessizlik sayısı:', silences.length);
      
      return {
        success: true,
        waveform,
        silences,
        duration
      };
    } catch (error) {
      console.error('Video analizi hatası:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Belirli bir zaman aralığı için otomatik kesim noktası önerileri oluşturur
   */
  suggestCutPoints(silences, startTime, maxDuration) {
    const endTime = startTime + maxDuration;
    
    // Bu aralıktaki sessizlikleri filtrele
    const relevantSilences = silences.filter(s => 
      s.middle >= startTime && s.middle <= endTime
    );
    
    if (relevantSilences.length === 0) {
      // Sessizlik yoksa max sürenin sonunu öner
      return [endTime];
    }
    
    // En uzun sessizliği bul (genellikle daha iyi bir kesim noktasıdır)
    const longestSilence = relevantSilences.reduce((longest, current) => {
      const currentLength = current.end - current.start;
      const longestLength = longest.end - longest.start;
      return currentLength > longestLength ? current : longest;
    });
    
    // Sessizliğin ortası optimal kesim noktası
    return [longestSilence.middle];
  }
}

module.exports = new VideoAnalyzer();
