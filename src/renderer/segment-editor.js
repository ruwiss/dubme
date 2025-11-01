const { ipcRenderer } = require('electron');

// State
let videoData = null;
let analysisData = null;
let segments = [];
let audioPlayer = null;
let isPlaying = false;
let animationId = null;
let audioContext = null;
let audioBuffer = null;
let audioSource = null;
let suggestedCutPoints = []; // Otomatik önerilen kesim noktaları
let selectedApis = []; // Seçilen optimize edilmiş API listesi
let isDragging = false;
let draggedMarkerIndex = -1;
let playbackStartTime = 0;
let playbackDuration = 0;
let playbackAnimationFrame = null;
let isPlayingAudio = false;
let isPaused = false;
let currentPlaybackPosition = 0;
let pausedAtTime = 0;

// Elements - will be initialized after DOM loads
let backBtn, finishBtn, videoTitle, videoDuration, totalCredits, maxSegments;
let selectedSegments, remainingCredits, waveformCanvas, segmentsOverlay, timeMarkers;
let startInput, endInput, addSegmentBtn, autoSuggestBtn, segmentsListContent;
let playPauseBtn, currentTimeDisplay, totalTimeDisplay, addNewSegmentBtn;
let isDraggingCutPoint = false;
let draggedCutPointIndex = -1;

function initElements() {
  backBtn = document.getElementById('backBtn');
  finishBtn = document.getElementById('finishBtn');
  videoTitle = document.getElementById('videoTitle');
  videoDuration = document.getElementById('videoDuration');
  totalCredits = document.getElementById('totalCredits');
  maxSegments = document.getElementById('maxSegments');
  selectedSegments = document.getElementById('selectedSegments');
  remainingCredits = document.getElementById('remainingCredits');
  waveformCanvas = document.getElementById('waveformCanvas');
  segmentsOverlay = document.getElementById('segmentsOverlay');
  timeMarkers = document.getElementById('timeMarkers');
  startInput = document.getElementById('startInput');
  endInput = document.getElementById('endInput');
  addSegmentBtn = document.getElementById('addSegmentBtn');
  autoSuggestBtn = document.getElementById('autoSuggestBtn');
  segmentsListContent = document.getElementById('segmentsListContent');
  playPauseBtn = document.getElementById('playPauseBtn');
  currentTimeDisplay = document.getElementById('currentTime');
  totalTimeDisplay = document.getElementById('totalTime');
  addNewSegmentBtn = document.getElementById('addSegmentBtn');
  
  console.log('DOM elements initialized');
}

// Initialize
async function initialize() {
  try {
    console.log('Segment editor initializing...');
    
    // Temayı ana pencereden al
    try {
      const settings = await ipcRenderer.invoke('load-settings');
      console.log('Settings loaded:', settings);
      if (settings && settings.theme) {
        document.body.setAttribute('data-theme', settings.theme);
        console.log('Theme applied:', settings.theme);
      } else {
        // Varsayılan olarak dark tema
        document.body.setAttribute('data-theme', 'dark');
        console.log('Default dark theme applied');
      }
    } catch (themeError) {
      console.error('Theme loading error:', themeError);
      document.body.setAttribute('data-theme', 'dark');
    }
    
    // Video verisini al
    videoData = await ipcRenderer.invoke('get-segment-editor-data');
    console.log('Video data received:', videoData);
    
    if (!videoData) {
      console.error('No video data found!');
      alert('Video verisi bulunamadı!');
      goBack();
      return;
    }
    
    // UI'ı güncelle
    console.log('Updating UI...');
    updateUI();
    
    // Video analizi yap
    console.log('Starting video analysis...');
    await analyzeVideo();
    
    // Otomatik segmentleri hesapla ve öner
    console.log('Calculating auto segments...');
    calculateAutoSegments();
    
    // Ses yükle
    console.log('Loading audio...');
    await loadAudio();
    
    console.log('Initialization complete');
    
  } catch (error) {
    console.error('Initialization error:', error);
    alert('Bir hata oluştu: ' + error.message);
  }
}

function updateUI() {
  try {
    videoTitle.textContent = videoData.title || 'Video';
    videoDuration.textContent = formatTime(videoData.duration || 0);
    
    // Tüm API anahtarlarının toplam kredisi
    const totalApiCredits = videoData.apiKeys.reduce((sum, key) => sum + key.remainingLimit, 0);
    totalCredits.textContent = totalApiCredits.toLocaleString();
    
    // Max segment sayısı = API anahtar sayısı
    maxSegments.textContent = videoData.apiKeys.length;
    
    // End input'un max değerini ayarla
    endInput.max = videoData.duration || 100;
    startInput.max = videoData.duration || 100;
    endInput.value = Math.min(30, videoData.duration || 30);
    
    console.log('UI updated successfully');
    console.log('Total credits:', totalApiCredits);
    console.log('API keys:', videoData.apiKeys.length);
  } catch (error) {
    console.error('UI update error:', error);
  }
}

async function analyzeVideo() {
  try {
    if (!videoData || !videoData.path) {
      throw new Error('Video path is missing');
    }
    
    console.log('Analyzing video:', videoData.path);
    console.log('Video duration:', videoData.duration);
    
    // Show loading indicator
    videoTitle.textContent = 'Video analiz ediliyor...';
    
    const result = await ipcRenderer.invoke('analyze-video', {
      videoPath: videoData.path,
      duration: videoData.duration
    });
    
    console.log('Analysis result:', result);
    
    if (!result || !result.success) {
      throw new Error(result?.error || 'Analysis failed');
    }
    
    analysisData = result;
    console.log('Analysis complete:', analysisData);
    console.log('- Waveform samples:', analysisData.waveform?.length);
    console.log('- Silences found:', analysisData.silences?.length);
    
    // Restore title
    videoTitle.textContent = videoData.title || 'Video';
    
    // Waveform çiz
    drawWaveform();
    
    // Zaman işaretleyicilerini ekle
    drawTimeMarkers();
    
  } catch (error) {
    console.error('Analysis error:', error);
    videoTitle.textContent = 'Analiz hatası!';
    alert('Video analizi başarısız: ' + error.message);
  }
}

// Otomatik segmentleri hesapla (API anahtarlarına göre)
function calculateAutoSegments() {
  try {
    if (!videoData.apiKeys || videoData.apiKeys.length === 0) {
      console.error('No API keys provided');
      return;
    }
    
    // Gerekli toplam kredi
    const requiredCredits = Math.ceil((videoData.duration / 30) * 1000);
    
    console.log('Starting auto segmentation:');
    console.log('- Video duration:', videoData.duration, 'seconds');
    console.log('- Required credits:', requiredCredits);
    console.log('- Available API keys:', videoData.apiKeys.map((k, i) => `API ${i+1}: ${k.remainingLimit} credits`));
    
    // API key'leri küçükten büyüğe sırala (ama orijinal index'lerini sakla)
    const apiKeysWithIndex = videoData.apiKeys.map((key, index) => ({
      ...key,
      originalIndex: index
    })).sort((a, b) => a.remainingLimit - b.remainingLimit);
    
    // En az sayıda API key ile videoyu karşılayacak kombinasyonu bul
    selectedApis = []; // Global değişkeni sıfırla
    let totalSelectedCredits = 0;
    
    // Greedy yaklaşım: Küçükten başlayarak ekle, yeterli olduğunda dur
    for (const apiKey of apiKeysWithIndex) {
      if (totalSelectedCredits >= requiredCredits) {
        break;
      }
      selectedApis.push(apiKey);
      totalSelectedCredits += apiKey.remainingLimit;
    }
    
    // Eğer hala yetmiyor ise hata ver
    if (totalSelectedCredits < requiredCredits) {
      console.error('Not enough credits even with all API keys!');
      alert('Yetersiz kredi! Video için daha fazla kredi gerekiyor.');
      return;
    }
    
    console.log('Selected APIs:', selectedApis.map(api => `API ${api.originalIndex + 1}: ${api.remainingLimit} credits`));
    console.log('Total selected credits:', totalSelectedCredits);
    
    // Seçilen API'leri orijinal sıraya göre sırala (büyükten küçüğe - segment sırası için)
    selectedApis.sort((a, b) => b.remainingLimit - a.remainingLimit);
    
    // Şimdi seçilen API'lerle segmentasyon yap
    let currentTime = 0;
    let apiKeyIndex = 0;
    
    suggestedCutPoints = [0]; // Başlangıç
    
    while (currentTime < videoData.duration && apiKeyIndex < selectedApis.length) {
      const currentApiKey = selectedApis[apiKeyIndex];
      const availableCredits = currentApiKey.remainingLimit;
      
      // Kalan video süresi
      const remainingDuration = videoData.duration - currentTime;
      
      // Bu API ile maksimum ne kadar süre işlenebilir (saniye)
      const maxDurationByCredits = (availableCredits / 1000) * 30;
      
      // Maksimum süre: krediye veya kalan videoya göre
      const maxDuration = Math.min(
        maxDurationByCredits, // Krediye göre max süre
        remainingDuration // Kalan video süresi
      );
      
      console.log(`API ${apiKeyIndex + 1}:`, {
        credits: availableCredits,
        maxByCredits: maxDurationByCredits.toFixed(1) + 's',
        actual: maxDuration.toFixed(1) + 's',
        range: `${currentTime.toFixed(1)}s - ${(currentTime + maxDuration).toFixed(1)}s`
      });
      
      if (maxDuration < 1) {
        console.log(`API ${apiKeyIndex + 1} insufficient, trying next...`);
        apiKeyIndex++;
        continue;
      }
      
      // Bu API için maksimum cut point (API limit dahilinde)
      let cutPoint = currentTime + maxDuration;
      
      // ONEMLI: Sessizlik araması SADECE API limitini aşmayacak aralıkta yapılmalı
      // Yoksa cut point çok ileri veya geri gidip API limitini aşabilir
      if (cutPoint < videoData.duration && analysisData && analysisData.silences) {
        // Sessizlik arama aralığı: cutPoint'ten önce ve sonra 5 saniye
        // (30 saniye değil, 5 saniye - daha hassas kontrol)
        const searchRadius = 5; // saniye
        const searchWindowStart = Math.max(currentTime + 1, cutPoint - searchRadius);
        const searchWindowEnd = Math.min(videoData.duration, cutPoint + searchRadius);
        
        // ONEMLI: searchWindowEnd API limitini aşmamalı
        const maxAllowedEnd = currentTime + maxDuration;
        const safeSearchEnd = Math.min(searchWindowEnd, maxAllowedEnd);
        
        const silencesInRange = analysisData.silences.filter(s => 
          s.middle >= searchWindowStart && s.middle <= safeSearchEnd
        );
        
        if (silencesInRange.length > 0) {
          // En uzun sessizliği seç (ama hala API limit içinde)
          const longestSilence = silencesInRange.reduce((longest, current) => {
            const currentLength = current.end - current.start;
            const longestLength = longest.end - longest.start;
            return currentLength > longestLength ? current : longest;
          });
          
          const silenceCutPoint = longestSilence.middle;
          
          // Sessizliğin API limitini aşmadığından emin ol
          if (silenceCutPoint <= maxAllowedEnd) {
            cutPoint = silenceCutPoint;
            console.log(`Found silence at ${cutPoint.toFixed(1)}s (was ${maxAllowedEnd.toFixed(1)}s)`);
          } else {
            console.log(`Silence at ${silenceCutPoint.toFixed(1)}s exceeds API limit, using ${cutPoint.toFixed(1)}s`);
          }
        } else {
          console.log(`No silence found near ${cutPoint.toFixed(1)}s, using calculated position`);
        }
      }
      
      // Final kontrol: API limitini kesinlikle aşmamalı
      cutPoint = Math.min(cutPoint, currentTime + maxDuration, videoData.duration);
      
      // Bir sonraki API'ye geçmeden önce currentTime'ı güncelle
      currentTime = cutPoint;
      
      // Eğer video bitmemişse kesim noktası ekle (son API değilse VEYA video henüz bitmemişse)
      if (cutPoint < videoData.duration - 0.1) { // 0.1s tolerans
        suggestedCutPoints.push(cutPoint);
        console.log(`Cut point added at ${cutPoint.toFixed(1)}s`);
      }
      
      // Bir sonraki API'ye geç
      apiKeyIndex++;
      
      // Video bittiğinde döngüyü sonlandır
      if (currentTime >= videoData.duration - 0.1) {
        console.log('Video end reached');
        break;
      }
    }
    
    // Son nokta olarak video sonunu ekle (eğer yoksa)
    const lastPoint = suggestedCutPoints[suggestedCutPoints.length - 1];
    if (lastPoint < videoData.duration - 0.1) { // 0.1s tolerans
      suggestedCutPoints.push(videoData.duration);
      console.log(`Final cut point added at ${videoData.duration}s (video end)`);
    } else if (Math.abs(lastPoint - videoData.duration) > 0.1) {
      // Son nokta video sonundan çok farklıysa düzelt
      suggestedCutPoints[suggestedCutPoints.length - 1] = videoData.duration;
      console.log(`Last cut point adjusted to ${videoData.duration}s (video end)`);
    }
    
    console.log('=== FINAL CUT POINTS ===');
    console.log('Cut points array:', suggestedCutPoints);
    console.log('Cut points count:', suggestedCutPoints.length);
    console.log('Total segments:', suggestedCutPoints.length - 1);
    suggestedCutPoints.forEach((point, idx) => {
      console.log(`  [${idx}] ${point.toFixed(2)}s`);
    });
    
    // Otomatik segmentleri oluştur
    autoCreateSegments();
    
  } catch (error) {
    console.error('Auto segmentation error:', error);
  }
}

// Segment renkleri - daha düşük opaklık (0.15) sessizlik bölgelerini daha iyi görmek için
const segmentColors = [
  { bg: 'rgba(96, 205, 255, 0.15)', border: '#60cdff', button: '#60cdff' },
  { bg: 'rgba(76, 175, 80, 0.15)', border: '#4caf50', button: '#4caf50' },
  { bg: 'rgba(255, 152, 0, 0.15)', border: '#ff9800', button: '#ff9800' },
  { bg: 'rgba(156, 39, 176, 0.15)', border: '#9c27b0', button: '#9c27b0' },
  { bg: 'rgba(244, 67, 54, 0.15)', border: '#f44336', button: '#f44336' },
  { bg: 'rgba(233, 30, 99, 0.15)', border: '#e91e63', button: '#e91e63' },
  { bg: 'rgba(63, 81, 181, 0.15)', border: '#3f51b5', button: '#3f51b5' },
];

// Otomatik segmentleri oluştur (ilk kez - API atamaları ile)
function autoCreateSegments() {
  segments = [];
  
  for (let i = 0; i < suggestedCutPoints.length - 1; i++) {
    const start = suggestedCutPoints[i];
    const end = suggestedCutPoints[i + 1];
    const duration = end - start;
    const credits = Math.ceil((duration / 30) * 1000);
    const color = segmentColors[i % segmentColors.length];
    
    // Seçilen API'lerden bu segmente atanan API
    const selectedApiIndex = Math.min(i, selectedApis.length - 1);
    const selectedApi = selectedApis[selectedApiIndex];
    const assignedApiLimit = selectedApi.remainingLimit;
    const apiKeyIndex = selectedApi.originalIndex; // Orijinal videoData.apiKeys içindeki index
    const apiKeyString = selectedApi.key; // Gerçek API key string'i (selectedApi içinde var)
    
    segments.push({
      id: Date.now() + i,
      start,
      end,
      duration,
      credits,
      color,
      apiKeyIndex, // Hangi API anahtarı kullanılacak (UI için)
      apiKey: apiKeyString, // Gerçek API key (dublaj için)
      apiLimit: assignedApiLimit // O API'nin limiti
    });
  }
  
  updateSegmentsList();
  drawSegments();
  updateCreditsInfo();
  
  // Marker'ları çizmeden önce DOM'un güncellenmesini bekle
  requestAnimationFrame(() => {
    drawCutPointMarkers();
  });
  
  // Segment limiti uyarısı kontrolü
  checkSegmentLimitWarning();
}

// Segment limit uyarısını kontrol et
function checkSegmentLimitWarning() {
  // 2'den fazla segment yoksa kontrol etme
  if (segments.length <= 2) return;
  
  // Her segmentin kredi kullanımını API limitine göre kontrol et
  let segmentsAtLimit = 0;
  
  segments.forEach(seg => {
    const usagePercent = (seg.credits / seg.apiLimit) * 100;
    // %95 veya daha fazla kullanıyorsa limit olarak say
    if (usagePercent >= 95) {
      segmentsAtLimit++;
    }
  });
  
  // Yarısından fazlası limitdeyse uyarı göster
  const halfSegments = segments.length / 2;
  if (segmentsAtLimit > halfSegments) {
    console.log(`Warning: ${segmentsAtLimit}/${segments.length} segments are at API limit`);
    alert('⚠️ En az 1 API key daha eklemeniz önerilir.\n\nMevcut API keylerin limitleri kısıtlı olduğu için bu ekranda düzenleme imkanınız da kısıtlı olacaktır.');
  }
}

// Kesim noktasından segmentleri güncelle (API atamaları değişmeden)
function updateSegmentsFromCutPoints() {
  // Mevcut segmentlerin API atamalarını koru
  for (let i = 0; i < suggestedCutPoints.length - 1; i++) {
    if (!segments[i]) continue; // Segment yoksa atla
    
    const start = suggestedCutPoints[i];
    const end = suggestedCutPoints[i + 1];
    const duration = end - start;
    const credits = Math.ceil((duration / 30) * 1000);
    
    // Sadece süre ve kredi bilgilerini güncelle, API ataması aynı kalsın
    segments[i].start = start;
    segments[i].end = end;
    segments[i].duration = duration;
    segments[i].credits = credits;
    // apiKeyIndex ve apiLimit aynı kalıyor
  }
}

// Sürüklenen marker'ın pozisyonunu güncelle (yeniden oluşturmadan)
function updateDraggedMarkerPosition(newTime) {
  if (draggedCutPointIndex === -1 || !waveformCanvas) return;
  
  const canvasRect = waveformCanvas.getBoundingClientRect();
  const percent = (newTime / videoData.duration);
  const leftPx = canvasRect.left + (percent * canvasRect.width);
  
  // Sürüklenen marker'ı bul ve pozisyonunu güncelle
  const markers = document.querySelectorAll('.cut-point-marker');
  markers.forEach(marker => {
    const index = parseInt(marker.dataset.cutPointIndex);
    if (index === draggedCutPointIndex) {
      marker.style.left = `${leftPx}px`;
    }
  });
}

// Kesim noktası marker'larını çiz (sürüklenebilir)
function drawCutPointMarkers() {
  // Eski marker'ları temizle
  document.querySelectorAll('.cut-point-marker').forEach(el => el.remove());
  
  if (!waveformCanvas || suggestedCutPoints.length < 2) return;
  
  // Canvas pozisyonunu yeniden hesapla (DOM'da değişmiş olabilir)
  const canvasRect = waveformCanvas.getBoundingClientRect();
  
  console.log('Drawing', suggestedCutPoints.length - 2, 'markers. Canvas:', {
    left: canvasRect.left,
    width: canvasRect.width,
    top: canvasRect.top
  });
  
  // İlk ve son nokta hariç tüm kesim noktalarını çiz
  for (let i = 1; i < suggestedCutPoints.length - 1; i++) {
    const cutTime = suggestedCutPoints[i];
    const percent = (cutTime / videoData.duration);
    const leftPx = canvasRect.left + (percent * canvasRect.width);
    
    console.log(`Marker ${i}: time=${cutTime.toFixed(1)}s, percent=${(percent*100).toFixed(1)}%, leftPx=${leftPx.toFixed(0)}px`);
    
    const marker = document.createElement('div');
    marker.className = 'cut-point-marker';
    marker.dataset.cutPointIndex = i;
    marker.style.left = `${leftPx}px`;
    marker.style.top = `${canvasRect.top - 15}px`;
    marker.style.height = `${canvasRect.height + 30}px`;
    
    // Üst play butonu
    const playButton = document.createElement('div');
    playButton.className = 'cut-point-play-btn';
    playButton.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
    `;
    marker.appendChild(playButton);
    
    // Marker'a mousedown event ekle - her marker için ayrı closure
    (function(index, markerElement, playBtn, cutTime) {
      // Play butonuna tıklanınca o noktadan oynat
      playBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        playFromPosition(cutTime);
        console.log('Playing from cut point', index, 'at time', cutTime);
      });
      
      // Marker'a mousedown - play butonuna değilse sürükle
      markerElement.addEventListener('mousedown', (e) => {
        // Play butonuna tıklandıysa sürükleme yapma
        if (e.target.closest('.cut-point-play-btn')) {
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        isDraggingCutPoint = true;
        draggedCutPointIndex = index;
        markerElement.classList.add('dragging');
        console.log('Started dragging cut point', index);
      });
    })(i, marker, playButton, cutTime);
    
    document.body.appendChild(marker);
  }
}

// Global mouse move ve mouseup event handler'larını ekle
function setupCutPointDragHandlers() {
  if (window.cutPointDragHandlersAdded) return;
  window.cutPointDragHandlersAdded = true;
  
  document.addEventListener('mousemove', (e) => {
    if (!isDraggingCutPoint || draggedCutPointIndex === -1 || !waveformCanvas) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const canvasRect = waveformCanvas.getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const percent = Math.max(0, Math.min(1, x / canvasRect.width));
    let newTime = percent * videoData.duration;
    
    // Komşu kesim noktaları
    const prevCutPoint = suggestedCutPoints[draggedCutPointIndex - 1];
    const nextCutPoint = suggestedCutPoints[draggedCutPointIndex + 1];
    
    // Minimum segment süresi (1 saniye - API hatalarını önlemek için çok kısa tutuldu)
    const minSegmentDuration = 1;
    
    // Sol ve sağ segmentlerin API limitlerini al
    const leftSegmentIndex = draggedCutPointIndex - 1;
    const rightSegmentIndex = draggedCutPointIndex;
    
    const leftApiLimit = segments[leftSegmentIndex] ? segments[leftSegmentIndex].apiLimit : videoData.apiKeys[0].remainingLimit;
    const rightApiLimit = segments[rightSegmentIndex] ? segments[rightSegmentIndex].apiLimit : videoData.apiKeys[Math.min(rightSegmentIndex, videoData.apiKeys.length - 1)].remainingLimit;
    
    // Her segmentin kendi API limiti var
    const leftMaxDuration = (leftApiLimit / 1000) * 30; // Sol segment için max süre
    const rightMaxDuration = (rightApiLimit / 1000) * 30; // Sağ segment için max süre
    
    // Sol segment için limitleri hesapla
    const minTime = Math.max(
      prevCutPoint + minSegmentDuration, // Sol segment minimum 1 saniye
      nextCutPoint - rightMaxDuration // Sağ segment kendi API limitini aşamaz
    );
    
    // Sağ segment için limitleri hesapla  
    const maxTime = Math.min(
      nextCutPoint - minSegmentDuration, // Sağ segment minimum 1 saniye
      prevCutPoint + leftMaxDuration // Sol segment kendi API limitini aşamaz
    );
    
    // Yeni pozisyonu sınırla
    let clampedTime = Math.max(minTime, Math.min(maxTime, newTime));
    
    // Mıknatıslama devre dışı - serbest sürükleme için
    // const snapThreshold = 2;
    // if (pausedAtTime > 0 && Math.abs(clampedTime - pausedAtTime) < snapThreshold) {
    //   clampedTime = pausedAtTime;
    // }
    
    // Kesim noktasını güncelle
    suggestedCutPoints[draggedCutPointIndex] = clampedTime;
    
    // Etkilenen segmentleri güncelle (API atamalı değişmeden sadece süre/kredi güncelle)
    updateSegmentsFromCutPoints();
    
    // Sadece sürüklenen marker'ı güncelle
    updateDraggedMarkerPosition(clampedTime);
    
    // Segmentleri yeniden çiz
    drawSegments();
    updateSegmentsList();
    updateCreditsInfo();
  });
  
  document.addEventListener('mouseup', (e) => {
    if (isDraggingCutPoint) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Stopped dragging cut point', draggedCutPointIndex);
      
      // Dragging class'ını kaldır
      document.querySelectorAll('.cut-point-marker.dragging').forEach(m => {
        m.classList.remove('dragging');
      });
      
      isDraggingCutPoint = false;
      draggedCutPointIndex = -1;
      
      // Sürükleme bitti, tüm marker'ları yeniden çiz
      drawCutPointMarkers();
    }
  });
}

// Initialize ederken çağır
setupCutPointDragHandlers();

// updateMoveSegmentButton ve moveSegmentMarker fonksiyonları kaldırıldı - artık sürüklenebilir marker'lar kullanılıyor

// En yakın marker'ı belirtilen pozisyona taşı
function moveNearestMarkerToPosition(timePosition) {
  if (suggestedCutPoints.length <= 2) return; // Sadece başlangıç ve bitiş varsa işlem yapma
  
  // En yakın marker'ı bul (İlk ve son hariç)
  let nearestIndex = -1;
  let minDistance = Infinity;
  
  for (let i = 1; i < suggestedCutPoints.length - 1; i++) {
    const distance = Math.abs(suggestedCutPoints[i] - timePosition);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
    }
  }
  
  if (nearestIndex === -1) return;
  
  // Limit kontrolü: bir önceki ve bir sonraki nokta arasında kalmalı
  const minTime = suggestedCutPoints[nearestIndex - 1] + 30; // Min 30 saniye
  const maxTime = nearestIndex < suggestedCutPoints.length - 1 
    ? suggestedCutPoints[nearestIndex + 1] - 30
    : videoData.duration;
  
  let newTime = Math.max(minTime, Math.min(maxTime, timePosition));
  
  // Sessizlik varsa yakındaki sessizliğe snap yap
  if (analysisData && analysisData.silences) {
    const nearbySilence = analysisData.silences.find(s => 
      Math.abs(s.middle - newTime) < 5 // 5 saniye tolerans
    );
    
    if (nearbySilence) {
      newTime = nearbySilence.middle;
    }
  }
  
  // Marker'ı taşı
  suggestedCutPoints[nearestIndex] = newTime;
  
  // Görselleri güncelle
  autoCreateSegments();
  
  console.log(`Marker ${nearestIndex} moved to ${formatTime(newTime)}`);
}

// Ses yükleme ve oynatma
async function loadAudio() {
  try {
    // Audio context oluştur
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Video dosyasından geçici ses dosyası oluştur
    console.log('Extracting audio from video...');
    const audioPath = await ipcRenderer.invoke('extract-audio-for-preview', videoData.path);
    
    if (!audioPath) {
      console.warn('Audio extraction failed, playback will not be available');
      return;
    }
    
    console.log('Loading audio file:', audioPath);
    
    // Ses dosyasını yükle
    const fs = require('fs');
    const audioData = fs.readFileSync(audioPath);
    
    // ArrayBuffer'a dönüştür ve decode et
    const arrayBuffer = audioData.buffer.slice(
      audioData.byteOffset,
      audioData.byteOffset + audioData.byteLength
    );
    
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log('Audio loaded successfully, duration:', audioBuffer.duration);
    
  } catch (error) {
    console.error('Audio loading error:', error);
  }
}

function playFromPosition(startTime) {
  console.log(`Playing from ${startTime}s`);
  
  if (!audioContext || !audioBuffer) {
    console.warn('Audio not loaded yet');
    return;
  }
  
  try {
    // Varolan oynatmayı durdur
    if (audioSource) {
      try {
        audioSource.onended = null; // Event handler'ı kaldır
        audioSource.stop();
      } catch (e) {}
      audioSource = null;
    }
    
    // Audio context'ı resume et (pause'dan sonra gelebilir)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    // Kısa bir gecikme ekle (Web Audio API buffer için)
    setTimeout(() => {
      if (!audioContext || !audioBuffer) return;
      
      // Yeni source oluştur
      audioSource = audioContext.createBufferSource();
      audioSource.buffer = audioBuffer;
      audioSource.connect(audioContext.destination);
      
      // Video sonuna kadar oynat
      const duration = videoData.duration - startTime;
      const actualStartTime = audioContext.currentTime;
      audioSource.start(0, startTime, duration);
      
      // Playback bilgilerini kaydet - audioContext.currentTime kullan
      playbackStartTime = startTime;
      playbackDuration = duration;
      currentPlaybackPosition = startTime;
      isPlayingAudio = true;
      isPaused = false;
      
      // UI güncelle
      updatePlayPauseButton(true);
      
      console.log('Playing audio from', startTime, 'at context time', actualStartTime);
      
      // İlerleme animasyonunu başlat
      startPlaybackAnimation();
      
      // Otomatik durdur
      audioSource.onended = () => {
        // Sadece pause değilse bitir
        if (!isPaused) {
          console.log('Playback ended naturally');
          isPlayingAudio = false;
          updatePlayPauseButton(false);
          currentPlaybackPosition = 0;
          pausedAtTime = 0;
        }
      };
    }, 10); // 10ms gecikme
    
  } catch (error) {
    console.error('Audio playback error:', error);
  }
}

function pauseAudio() {
  if (audioSource && isPlayingAudio && !isPaused) {
    try {
      // Animasyonu durdur ve son pozisyonu al
      cancelAnimationFrame(playbackAnimationFrame);
      
      // Event handler'ı geçici olarak kaldır
      if (audioSource) {
        audioSource.onended = null;
      }
      
      // Pause et
      audioContext.suspend();
      
      // PAUSE ANİNDAKİ pozisyonu kaydet
      pausedAtTime = currentPlaybackPosition;
      isPlayingAudio = false;
      isPaused = true;
      
      // UI güncelle
      updatePlayPauseButton(false);
      updatePlaybackIndicator(pausedAtTime);
      updateTimeDisplay(pausedAtTime);
      
      console.log('Audio paused at', pausedAtTime, '(context time:', audioContext.currentTime, ')');
    } catch (e) {
      console.error('Pause error:', e);
    }
  }
}

function resumeAudio() {
  if (!isPlayingAudio && isPaused) {
    try {
      // Eski source'ı tamamen durdur
      if (audioSource) {
        try {
          audioSource.onended = null;
          audioSource.stop();
          audioSource.disconnect();
        } catch (e) {
          console.log('Old source already stopped');
        }
        audioSource = null;
      }
      
      // Context suspended ise resume et
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      // Pause edildiği pozisyondan YENİ bir source ile başlat
      console.log('Resuming from', pausedAtTime, '- creating new source');
      
      // Yeni source oluştur
      audioSource = audioContext.createBufferSource();
      audioSource.buffer = audioBuffer;
      audioSource.connect(audioContext.destination);
      
      // Pause edildiği yerden başlat
      const resumeStartTime = pausedAtTime;
      const duration = videoData.duration - resumeStartTime;
      audioSource.start(0, resumeStartTime, duration);
      
      // State güncelle
      playbackStartTime = resumeStartTime;
      playbackDuration = duration;
      currentPlaybackPosition = resumeStartTime;
      isPlayingAudio = true;
      isPaused = false;
      
      // Event handler
      audioSource.onended = () => {
        if (!isPaused) {
          console.log('Playback ended naturally');
          isPlayingAudio = false;
          updatePlayPauseButton(false);
          currentPlaybackPosition = 0;
          pausedAtTime = 0;
        }
      };
      
      // Animasyonu başlat
      startPlaybackAnimation();
      updatePlayPauseButton(true);
      
      console.log('Audio resumed from', resumeStartTime);
    } catch (e) {
      console.error('Resume error:', e);
    }
  }
}

function togglePlayPause() {
  console.log('Toggle play/pause - isPlaying:', isPlayingAudio, 'isPaused:', isPaused);
  
  if (isPlayingAudio && !isPaused) {
    // Şuan oynatıyorsa -> PAUSE
    pauseAudio();
  } else if (isPaused && audioSource) {
    // Pause durumundaysa -> RESUME
    resumeAudio();
  } else {
    // Hiç çalmıyorsa -> BAŞLA
    playFromPosition(pausedAtTime || 0);
  }
}

function updatePlayPauseButton(playing) {
  if (!playPauseBtn) return;
  
  const playIcon = playPauseBtn.querySelector('.play-icon');
  const pauseIcon = playPauseBtn.querySelector('.pause-icon');
  
  if (!playIcon || !pauseIcon) {
    console.error('Play/pause icons not found');
    return;
  }
  
  if (playing) {
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
  } else {
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
  }
  
  console.log('Play/Pause button updated:', playing ? 'PAUSE' : 'PLAY');
}

function stopAudio() {
  if (audioSource) {
    try {
      audioSource.stop();
    } catch (e) {
      // Already stopped
    }
    audioSource = null;
  }
  
  isPlayingAudio = false;
  isPaused = false;
  cancelAnimationFrame(playbackAnimationFrame);
  updatePlayPauseButton(false);
  
  // Indicator'ı KALDIRMA - duraklatınca kalmalı
  // document.querySelectorAll('.playback-indicator').forEach(el => el.remove());
}

function startPlaybackAnimation() {
  const startAudioTime = audioContext.currentTime;
  const animate = () => {
    if (!isPlayingAudio || !audioSource) return;
    
    const elapsed = audioContext.currentTime - startAudioTime;
    currentPlaybackPosition = playbackStartTime + elapsed;
    
    // UI güncelle
    updatePlaybackIndicator(currentPlaybackPosition);
    updateTimeDisplay(currentPlaybackPosition);
    
    playbackAnimationFrame = requestAnimationFrame(animate);
  };
  
  animate();
}

function updateTimeDisplay(currentTime) {
  if (currentTimeDisplay) {
    currentTimeDisplay.textContent = formatTime(currentTime);
  }
  if (totalTimeDisplay && videoData) {
    totalTimeDisplay.textContent = formatTime(videoData.duration);
  }
}

function updatePlaybackIndicator(timePosition) {
  const canvas = waveformCanvas;
  if (!canvas) return;
  
  const canvasRect = canvas.getBoundingClientRect();
  const percent = (timePosition / videoData.duration);
  const indicatorWidth = 3; // CSS'deki indicator genişliği
  const leftPx = canvasRect.left + (percent * canvasRect.width) - (indicatorWidth / 2);
  
  let indicator = document.querySelector('.playback-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'playback-indicator';
    indicator.style.position = 'fixed';
    document.body.appendChild(indicator);
  }
  
  indicator.style.left = `${leftPx}px`;
  indicator.style.top = `${canvasRect.top - 15}px`;
  indicator.style.height = `${canvasRect.height + 40}px`;
}

function showPlaybackIndicator(timePosition) {
  // Playback pozisyonunu göster
  const percent = (timePosition / videoData.duration) * 100;
  
  // Eski indicator'ı temizle
  document.querySelectorAll('.playback-indicator').forEach(el => el.remove());
  
  const indicator = document.createElement('div');
  indicator.className = 'playback-indicator';
  indicator.style.left = `${percent}%`;
  
  const container = document.querySelector('.timeline-container');
  container.appendChild(indicator);
  
  // 5 saniye sonra kaldır
  setTimeout(() => {
    indicator.remove();
  }, 5000);
}

function drawWaveform() {
  try {
    const canvas = waveformCanvas;
    if (!canvas) {
      console.error('Canvas element not found');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Cannot get canvas context');
      return;
    }
    
    // Canvas boyutunu ayarla - high DPI için
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    ctx.scale(dpr, dpr);
    
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    if (!analysisData || !analysisData.waveform) {
      console.error('No analysis data or waveform available');
      return;
    }
    
    const { waveform } = analysisData;
    const width = rect.width;
    const height = rect.height;
    const barWidth = width / waveform.length;
    
    // Temizle
    ctx.clearRect(0, 0, width, height);
    
    // Waveform çiz
    const style = getComputedStyle(document.documentElement);
    const waveformColor = style.getPropertyValue('--waveform-color').trim() || '#60cdff';
    
    ctx.fillStyle = waveformColor;
    
    waveform.forEach((value, index) => {
      const x = index * barWidth;
      const barHeight = value * height;
      const y = (height - barHeight) / 2;
      
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    });
    
    // Sessizlik bölgelerini işaretle
    if (analysisData.silences && analysisData.silences.length > 0) {
      const silenceColor = style.getPropertyValue('--silence-color').trim() || 'rgba(255, 185, 0, 0.15)';
      ctx.fillStyle = silenceColor;
      
      analysisData.silences.forEach(silence => {
        const startX = (silence.start / videoData.duration) * width;
        const endX = (silence.end / videoData.duration) * width;
        const silenceWidth = endX - startX;
        
        ctx.fillRect(startX, 0, silenceWidth, height);
      });
    }
    
    // Canvas'a tıklama ve sürükleme ile pozisyon seç
    let isDraggingSeek = false;
    let seekStarted = false;
    
    canvas.addEventListener('mousedown', (e) => {
      // Cut point marker sürükleniyorsa canvas event'ini ignore et
      if (isDraggingCutPoint) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      
      // Marker'ın üzerine tıklandıysa canvas event'ini ignore et
      const target = e.target;
      if (target.closest('.cut-point-marker')) {
        return;
      }
      
      isDraggingSeek = true;
      seekStarted = false;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const timePosition = (x / width) * videoData.duration;
      
      // Indicator'ı hemen göster
      pausedAtTime = timePosition;
      updatePlaybackIndicator(timePosition);
      updateTimeDisplay(timePosition);
    });
    
    canvas.addEventListener('mousemove', (e) => {
      // Cut point marker sürükleniyorsa canvas event'ini ignore et
      if (isDraggingCutPoint || !isDraggingSeek) return;
      
      seekStarted = true;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const timePosition = Math.max(0, Math.min(videoData.duration, (x / width) * videoData.duration));
      
      // Indicator'ı güncelle
      pausedAtTime = timePosition;
      updatePlaybackIndicator(timePosition);
      updateTimeDisplay(timePosition);
    });
    
    canvas.addEventListener('mouseup', (e) => {
      if (!isDraggingSeek) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const timePosition = (x / width) * videoData.duration;
      
      isDraggingSeek = false;
      
      // Sadece pozisyonu ayarla, oynatma
      pausedAtTime = timePosition;
      currentPlaybackPosition = timePosition;
      updatePlaybackIndicator(timePosition);
      updateTimeDisplay(timePosition);
      
      console.log('Seek position set to:', formatTime(timePosition));
    });
    
    canvas.addEventListener('mouseleave', () => {
      if (isDraggingSeek) {
        isDraggingSeek = false;
      }
    });
    
    console.log('Waveform drawn successfully');
  } catch (error) {
    console.error('Waveform drawing error:', error);
  }
}

function drawTimeMarkers() {
  timeMarkers.innerHTML = '';
  
  const markerCount = 10;
  const step = videoData.duration / markerCount;
  
  for (let i = 0; i <= markerCount; i++) {
    const time = i * step;
    const marker = document.createElement('span');
    marker.textContent = formatTime(time);
    timeMarkers.appendChild(marker);
  }
}

// Audio player removed - not needed for segment selection

// Manuel segment ekleme devre dışı (otomatik segmentasyon kullanılıyor)
// addSegment fonksiyonu kaldırıldı

function deleteSegment(id) {
  segments = segments.filter(seg => seg.id !== id);
  updateSegmentsList();
  drawSegments();
  updateCreditsInfo();
}

function editSegment(id) {
  const segment = segments.find(seg => seg.id === id);
  if (segment) {
    startInput.value = segment.start;
    endInput.value = segment.end;
    deleteSegment(id);
  }
}

function listenSegment(index) {
  const segment = segments[index];
  if (segment) {
    // Segment'in başından başlat
    playFromPosition(segment.start);
  }
}

function updateSegmentsList() {
  if (segments.length === 0) {
    segmentsListContent.innerHTML = '<p class="empty-message">Henüz segment eklenmedi</p>';
  } else {
    segmentsListContent.innerHTML = segments.map((seg, index) => `
      <div class="segment-item" style="background: ${seg.color.bg}; border-left: 3px solid ${seg.color.border};">
        <div class="segment-info">
          <strong>Segment ${index + 1}</strong>
          <span>${formatTime(seg.start)} - ${formatTime(seg.end)} (${seg.duration.toFixed(1)}s, ${seg.credits} kredi)</span>
          <small style="opacity: 0.7; display: block; margin-top: 4px;">API ${seg.apiKeyIndex + 1} (Max: ${seg.apiLimit.toLocaleString()} kredi)</small>
        </div>
        <div class="segment-actions">
          <button class="listen-segment-btn" onclick="listenSegment(${index})" title="Bu segmenti dinle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Dinle
          </button>
        </div>
      </div>
    `).join('');
  }
  
  selectedSegments.textContent = segments.length;
}

function drawSegments() {
  segmentsOverlay.innerHTML = '';
  
  const canvas = waveformCanvas;
  if (!canvas) return;
  
  const canvasRect = canvas.getBoundingClientRect();
  const overlayRect = segmentsOverlay.getBoundingClientRect();
  
  segments.forEach((seg, index) => {
    const marker = document.createElement('div');
    marker.className = 'segment-marker';
    
    const startPercent = (seg.start / videoData.duration) * 100;
    const widthPercent = ((seg.end - seg.start) / videoData.duration) * 100;
    
    marker.style.left = `${startPercent}%`;
    marker.style.width = `${widthPercent}%`;
    marker.style.background = seg.color.bg;
    marker.style.borderLeft = `2px solid ${seg.color.border}`;
    marker.style.borderRight = `2px solid ${seg.color.border}`;
    
    segmentsOverlay.appendChild(marker);
  });
}

function updateCreditsInfo() {
  const usedCredits = segments.reduce((sum, seg) => sum + seg.credits, 0);
  const totalApiCredits = videoData.apiKeys.reduce((sum, key) => sum + key.remainingLimit, 0);
  const remaining = totalApiCredits - usedCredits;
  
  remainingCredits.textContent = remaining.toLocaleString();
  
  // Tamamla butonunu aktif/pasif yap
  finishBtn.disabled = segments.length === 0;
  
  // Segment ekleme butonunu aktif/pasif yap
  updateAddSegmentButton();
}

// Segment ekleme butonu durumunu güncelle
function updateAddSegmentButton() {
  if (!addNewSegmentBtn) return;
  
  // Kullanılmayan API key'leri bul - seçilmemiş olanlardan
  const usedApiIndices = selectedApis.map(api => api.originalIndex);
  const unusedApiKeys = videoData.apiKeys.filter((key, idx) => !usedApiIndices.includes(idx));
  
  // Eğer kullanılmayan API key var ve en az birinin kredisi varsa aktif et
  const hasAvailableApi = unusedApiKeys.some(key => key.remainingLimit >= 667); // En az 20 saniye (667 kredi)
  
  if (hasAvailableApi) {
    addNewSegmentBtn.disabled = false;
    addNewSegmentBtn.title = 'Yeni segment ekle';
  } else {
    addNewSegmentBtn.disabled = true;
    if (unusedApiKeys.length === 0) {
      addNewSegmentBtn.title = 'Tüm API key\'ler kullanılıyor';
    } else {
      addNewSegmentBtn.title = 'Kullanılabilir kredisi olan API key eklemelisiniz';
    }
  }
}

// Yeni segment ekle
function addNewSegment() {
  if (!videoData || !videoData.apiKeys) return;
  
  // Kullanılmayan API key'leri bul
  const usedApiIndices = selectedApis.map(api => api.originalIndex);
  const unusedApiKeys = videoData.apiKeys
    .map((key, idx) => ({ ...key, originalIndex: idx }))
    .filter(key => !usedApiIndices.includes(key.originalIndex));
    
  if (unusedApiKeys.length === 0) {
    alert('Tüm API key\'ler zaten kullanılıyor!');
    return;
  }
  
  // En küçük kredili kullanılmayan API'yi seç
  const sortedUnused = unusedApiKeys.sort((a, b) => a.remainingLimit - b.remainingLimit);
  const newApiKey = sortedUnused[0];
  const newApiLimit = newApiKey.remainingLimit;
  
  if (newApiLimit < 667) { // En az 20 saniye için 667 kredi gerekli
    alert('Yeni segment eklemek için yeterli kredisi olan API key eklemelisiniz!');
    return;
  }
  
  // Yeni segment için minimum 20 saniye alan hesapla
  const minNewSegmentDuration = 20;
  const minExistingSegmentDuration = 20;
  
  // Tüm segmentlerin toplam süresi
  const totalCurrentDuration = videoData.duration;
  
  // Yeni segment dahil toplam segment sayısı
  const newTotalSegments = segments.length + 1;
  
  // Her segment için minimum toplam alan
  const minTotalDuration = newTotalSegments * minExistingSegmentDuration;
  
  // Eğer video süresi yeterli değilse hata ver
  if (totalCurrentDuration < minTotalDuration) {
    alert(`Yeni segment eklemek için video çok kısa! En az ${minTotalDuration} saniye gerekli.`);
    return;
  }
  
  // Yeni API'yi seçilen listesine ekle
  selectedApis.push(newApiKey);
  // Büyükten küçüğe tekrar sırala
  selectedApis.sort((a, b) => b.remainingLimit - a.remainingLimit);
  
  console.log('New API added:', newApiKey.originalIndex, 'with', newApiKey.remainingLimit, 'credits');
  
  // Her segment için eşit dağıtım yap (her segmente en az 20s garantili)
  // Ama mevcut API limitlerini de göz önünde bulundur
  const newCutPoints = [0];
  let currentTime = 0;
  
  for (let i = 0; i < newTotalSegments; i++) {
    const apiKey = selectedApis[i];
    const apiLimit = apiKey.remainingLimit;
    const maxDurationByCredits = (apiLimit / 1000) * 30;
    
    // Kalan video süresi
    const remainingDuration = totalCurrentDuration - currentTime;
    const remainingSegments = newTotalSegments - i;
    
    // Bu segment için ideal süre: kalan süre / kalan segment sayısı
    const idealDuration = remainingDuration / remainingSegments;
    
    // Gerçek süre: minimum, ideal ve kredi limitine göre
    const actualDuration = Math.min(
      Math.max(minExistingSegmentDuration, idealDuration),
      maxDurationByCredits,
      remainingDuration
    );
    
    currentTime += actualDuration;
    
    // Son segment hariç kesim noktalarını ekle
    if (i < newTotalSegments - 1) {
      newCutPoints.push(currentTime);
    }
  }
  
  // Son nokta olarak video sonunu ekle
  newCutPoints.push(videoData.duration);
  
  // Yeni kesim noktalarını uygula
  suggestedCutPoints = newCutPoints;
  
  // Tüm segmentleri yeniden oluştur
  autoCreateSegments();
  
  console.log('New segment added');
}

// autoSuggest, resetSegments ve previewSegments fonksiyonları kaldırıldı

function goBack() {
  ipcRenderer.send('close-segment-editor');
}

async function finish() {
  if (segments.length === 0) {
    alert('En az bir segment eklemelisiniz!');
    return;
  }
  
  // Segmentleri ana sayfaya gönder
  await ipcRenderer.invoke('set-segments', segments);
  
  // Ana sayfaya dön
  ipcRenderer.send('close-segment-editor');
}

// Utility functions
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Global fonksiyonlar (HTML'den çağrılabilir)
window.editSegment = editSegment;
window.deleteSegment = deleteSegment;
window.listenSegment = listenSegment;
window.addNewSegment = addNewSegment;

// Event listeners'i initialize et
function initEventListeners() {
  backBtn.addEventListener('click', goBack);
  finishBtn.addEventListener('click', finish);
  playPauseBtn.addEventListener('click', togglePlayPause);
  addNewSegmentBtn.addEventListener('click', addNewSegment);
  
  // Window resize için waveform yeniden çiz
  window.addEventListener('resize', () => {
    if (analysisData) {
      drawWaveform();
      drawSegments();
      drawCutPointMarkers();
      
      // Playback indicator'ı güncelle
      if (isPlayingAudio && playbackStartTime >= 0) {
        const elapsed = audioContext.currentTime - (audioContext.currentTime - playbackStartTime);
        updatePlaybackIndicator(playbackStartTime + elapsed);
      }
    }
  });
  
  // Scroll olaylarında marker pozisyonlarını güncelle
  window.addEventListener('scroll', () => {
    if (analysisData) {
      drawCutPointMarkers();
      
      // Playback indicator'ı güncelle
      if (isPlayingAudio && playbackStartTime >= 0) {
        const elapsed = audioContext.currentTime - (audioContext.currentTime - playbackStartTime);
        updatePlaybackIndicator(playbackStartTime + elapsed);
      }
    }
  });
  
  // Space tuşu ile duraklat/oynat
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    }
  });
  
  console.log('Event listeners initialized');
}

// DOM hazır olunca başlat
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    initElements();
    initEventListeners();
    initialize();
  });
} else {
  console.log('DOM already loaded, initializing immediately...');
  initElements();
  initEventListeners();
  initialize();
}
