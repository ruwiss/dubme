const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core');
const YTDlpWrap = require('yt-dlp-wrap').default;

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

// Set ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Initialize yt-dlp wrapper
const ytDlpWrap = new YTDlpWrap();

class VideoUtils {
  async getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const duration = metadata.format.duration;
          resolve(Math.ceil(duration));
        }
      });
    });
  }

  async mergeVideoSegments(segments, outputPath, isAudioOnly = false) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // Tüm segmentleri input olarak ekle
      segments.forEach(segment => {
        command.input(segment.path);
      });

      // Merge işlemi
      command
        .on('start', (cmd) => {
          console.log('FFmpeg komutu:', cmd);
        })
        .on('progress', (progress) => {
          console.log('İlerleme:', progress.percent + '%');
        })
        .on('end', () => {
          console.log('Birleştirme tamamlandı');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg hatası:', err);
          reject(err);
        });

      if (isAudioOnly) {
        command
          .outputOptions('-c:a', 'copy')
          .save(outputPath);
      } else {
        command
          .mergeToFile(outputPath, path.dirname(outputPath));
      }
    });
  }

  async mergeAudioSegments(segments, outputPath) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // Tüm audio segmentlerini input olarak ekle
      segments.forEach(segment => {
        command.input(segment.path);
      });

      // Concat filter kullanarak audio'ları birleştir
      const filterComplex = segments.map((_, i) => `[${i}:a]`).join('') + `concat=n=${segments.length}:v=0:a=1[out]`;

      command
        .complexFilter(filterComplex)
        .outputOptions('-map', '[out]')
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .on('start', (cmd) => {
          console.log('FFmpeg audio merge komutu:', cmd);
        })
        .on('progress', (progress) => {
          console.log('Audio birleştirme ilerleme:', progress.percent + '%');
        })
        .on('end', () => {
          console.log('Audio birleştirme tamamlandı');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg audio merge hatası:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  async mergeVideoWithAudio(videoPath, audioPath, outputPath, onProgress) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      command
        .input(videoPath)
        .input(audioPath)
        // Video'nun orjinal sesini kaldır, sadece yeni sesi ekle
        .outputOptions([
          '-map', '0:v', // Video stream'i ilk input'tan al
          '-map', '1:a', // Audio stream'i ikinci input'tan al
          '-c:v', 'copy', // Video'yu yeniden encode etme (hızlı)
          '-c:a', 'aac', // Audio'yu aac codec ile encode et
          '-b:a', '192k', // Audio bitrate
          '-shortest' // En kısa stream'e göre kes
        ])
        .on('start', (cmd) => {
          console.log('FFmpeg video+audio merge komutu:', cmd);
        })
        .on('progress', (progress) => {
          console.log('Video+Audio birleştirme ilerleme:', progress.percent + '%');
          if (onProgress) {
            onProgress(progress.percent || 0);
          }
        })
        .on('end', () => {
          console.log('Video+Audio birleştirme tamamlandı');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg video+audio merge hatası:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  async extractYouTubeVideoId(url) {
    // YouTube video ID'sini URL'den çıkar
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/ // YouTube Shorts
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  isYouTubeUrl(url) {
    return url.includes('youtube.com') || url.includes('youtu.be');
  }

  async getYouTubeVideoInfo(url) {
    // Sadece ytdl-core kullan
    try {
      console.log('ytdl-core ile video bilgisi alınıyor...');
      if (!ytdl.validateURL(url)) {
        throw new Error('Geçersiz YouTube URL');
      }
      
      const info = await ytdl.getInfo(url);
      const videoDetails = info.videoDetails;
      
      return {
        success: true,
        title: videoDetails.title,
        duration: parseInt(videoDetails.lengthSeconds),
        thumbnail: videoDetails.thumbnails[videoDetails.thumbnails.length - 1]?.url || '',
        author: videoDetails.author.name,
        viewCount: videoDetails.viewCount
      };
    } catch (error) {
      console.error('YouTube video bilgisi alma hatası:', error);
      return {
        success: false,
        error: error.message || 'YouTube video bilgisi alınamadı'
      };
    }
  }

  async cleanupTempFiles(files) {
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        console.error('Geçici dosya silinemedi:', error);
      }
    }
  }

  async getAvailableQualities(url) {
    try {
      const info = await ytdl.getInfo(url);
      const formats = info.formats
        .filter(f => f.hasVideo && f.hasAudio)
        .map(f => ({
          quality: f.qualityLabel || f.quality,
          itag: f.itag,
          container: f.container,
          size: f.contentLength ? (parseInt(f.contentLength) / 1024 / 1024).toFixed(2) + ' MB' : 'Bilinmiyor'
        }))
        .filter((v, i, a) => a.findIndex(t => t.quality === v.quality) === i);
      
      return {
        success: true,
        qualities: formats
      };
    } catch (error) {
      console.error('Kalite bilgisi alınamadı:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async downloadYouTubeVideo(url, outputPath, quality = 'highest', onProgress = null) {
    try {
      const args = [
        '-o', outputPath,
        '--no-playlist',
        '--no-check-certificates'
      ];
      
      if (quality !== 'highest') {
        // Belirli bir itag seçilmiş
        args.push('-f', quality);
      }
      
      // Progress callback
      const progressCallback = (progress) => {
        if (onProgress && progress.percent) {
          onProgress(progress.percent.toFixed(2), 0, 100);
        }
      };
      
      // Download using yt-dlp-wrap
      await ytDlpWrap.execPromise([url, ...args]);
      
      return outputPath;
    } catch (error) {
      throw new Error('Video indirme hatası: ' + error.message);
    }
  }
}

module.exports = new VideoUtils();
