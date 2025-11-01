const { ipcRenderer } = require('electron');
const elevenLabsService = require('../features/dubbing/elevenlabs-service');
const videoUtils = require('../features/dubbing/video-utils');
const fs = require('fs');
const path = require('path');

// State
let settings = {
  apiKeys: [],
  archivedApiKeys: [],
  outputFolder: null,
  downloadFolder: null,
  mergeOutputFolder: null,
  theme: 'dark'
};
let selectedVideo = null;
let videoDuration = 0;
let youtubeInputTimeout = null;
let mergeVideoPath = null;
let mergeAudioPath = null;

// Init
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  // Tema ayarını yükle
  if (settings.theme) {
    updateTheme(settings.theme);
  }
  initEventListeners();
});

// Settings
async function loadSettings() {
  settings = await ipcRenderer.invoke('load-settings');
  renderApiKeys();
}

async function saveSettings() {
  await ipcRenderer.invoke('save-settings', settings);
}

// Event Listeners
function initEventListeners() {
  // Main tabs
  document.querySelectorAll('.main-tab').forEach(tab => {
    tab.addEventListener('click', () => switchMainTab(tab.dataset.tab));
  });
  
  // Settings page
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('close-settings-btn').addEventListener('click', closeSettings);
  
  // Settings tabs
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => switchSettingsTab(tab.dataset.tab));
  });
  
  // API Keys sub-tabs
  document.querySelectorAll('.api-keys-subtab').forEach(subtab => {
    subtab.addEventListener('click', () => switchApiKeysSubtab(subtab.dataset.subtab));
  });
  
  // Theme change
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      settings.theme = e.target.value;
      updateTheme(settings.theme);
      await saveSettings();
    });
  });
  
  document.getElementById('select-output-folder-btn').addEventListener('click', selectOutputFolder);
  document.getElementById('select-download-folder-btn').addEventListener('click', selectDownloadFolder);
  document.getElementById('select-merge-output-folder-btn').addEventListener('click', selectMergeOutputFolder);
  
  // API Key management
  document.getElementById('add-api-key-btn').addEventListener('click', showApiKeyForm);
  document.getElementById('save-api-key-btn').addEventListener('click', saveApiKey);
  document.getElementById('cancel-api-key-btn').addEventListener('click', hideApiKeyForm);
  document.getElementById('api-help').addEventListener('click', openApiHelp);
  
  // Video selection
  document.getElementById('select-video-btn').addEventListener('click', selectVideoFile);
  document.getElementById('remove-video-btn').addEventListener('click', removeVideo);
  
  // Drag and drop
  const dropzone = document.getElementById('video-dropzone');
  dropzone.addEventListener('dragover', handleDragOver);
  dropzone.addEventListener('dragleave', handleDragLeave);
  dropzone.addEventListener('drop', handleDrop);
  
  // YouTube URL
  document.getElementById('youtube-url').addEventListener('input', handleYouTubeInput);
  
  // YouTube Download
  document.getElementById('download-youtube-btn').addEventListener('click', downloadYouTubeVideo);
  
  // Start dubbing
  document.getElementById('start-dubbing-btn').addEventListener('click', startDubbing);
  
  // Segment editor
  document.getElementById('open-segment-editor-btn').addEventListener('click', openSegmentEditor);
  document.getElementById('edit-segments-btn').addEventListener('click', openSegmentEditor);
  
  // Merge tab
  document.getElementById('select-merge-video-btn').addEventListener('click', selectMergeVideo);
  document.getElementById('select-merge-audio-btn').addEventListener('click', selectMergeAudio);
  document.getElementById('start-merge-btn').addEventListener('click', startMerge);
}

// Main Tab Switching
function switchMainTab(tabName) {
  // Tab butonlarını güncelle
  document.querySelectorAll('.main-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  // Section'ları güncelle
  document.getElementById('dubbing-section').classList.toggle('hidden', tabName !== 'dubbing');
  document.getElementById('merge-section').classList.toggle('hidden', tabName !== 'merge');
}

// Theme
function updateTheme(theme) {
  if (theme) {
    settings.theme = theme;
  }
  document.body.setAttribute('data-theme', settings.theme);
}

// Settings Page
async function openSettings() {
  document.getElementById('settings-page').classList.remove('hidden');
  document.getElementById('dubbing-section').classList.add('hidden');
  renderApiKeys();
  
  // Mevcut temayı seçili yap
  const themeRadio = document.querySelector(`input[name="theme"][value="${settings.theme}"]`);
  if (themeRadio) {
    themeRadio.checked = true;
  }
  
  // Default folder yollarını al
  try {
    const defaultFolders = await ipcRenderer.invoke('get-default-folders');
    console.log('Default folders:', defaultFolders);
    
    // Output folder göster
    const outputFolder = settings.outputFolder || defaultFolders.dubbed;
    console.log('Output folder:', outputFolder);
    document.getElementById('output-folder').value = outputFolder;
    document.getElementById('output-folder').placeholder = defaultFolders.dubbed;
    
    // Download folder göster
    const downloadFolder = settings.downloadFolder || 'Varsayılan (İndirilenler)';
    document.getElementById('download-folder').value = downloadFolder;
    document.getElementById('download-folder').placeholder = 'Varsayılan (İndirilenler)';
    
    // Merge output folder göster
    const mergeOutputFolder = settings.mergeOutputFolder || defaultFolders.merged;
    console.log('Merge output folder:', mergeOutputFolder);
    document.getElementById('merge-output-folder').value = mergeOutputFolder;
    document.getElementById('merge-output-folder').placeholder = defaultFolders.merged;
  } catch (error) {
    console.error('Error loading default folders:', error);
  }
}

async function selectOutputFolder() {
  const folderPath = await ipcRenderer.invoke('select-folder');
  if (folderPath) {
    settings.outputFolder = folderPath;
    document.getElementById('output-folder').value = folderPath;
    await saveSettings();
  }
}

async function selectDownloadFolder() {
  const folderPath = await ipcRenderer.invoke('select-folder');
  if (folderPath) {
    settings.downloadFolder = folderPath;
    document.getElementById('download-folder').value = folderPath;
    await saveSettings();
  }
}

async function selectMergeOutputFolder() {
  const folderPath = await ipcRenderer.invoke('select-folder');
  if (folderPath) {
    settings.mergeOutputFolder = folderPath;
    document.getElementById('merge-output-folder').value = folderPath;
    await saveSettings();
  }
}

function closeSettings() {
  document.getElementById('settings-page').classList.add('hidden');
  
  // Aktif tab'ı geri göster
  const activeTab = document.querySelector('.main-tab.active')?.dataset.tab || 'dubbing';
  switchMainTab(activeTab);
  
  hideApiKeyForm();
}

function switchSettingsTab(tabName) {
  // Tab butonlarını güncelle
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  // Tab içeriklerini güncelle
  document.querySelectorAll('.settings-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
  
  // API Keys tab'a geçildiğinde limitleri çek
  if (tabName === 'api-keys') {
    checkAllApiLimits();
  }
}

function switchApiKeysSubtab(subtabName) {
  // Sub-tab butonlarını güncelle
  document.querySelectorAll('.api-keys-subtab').forEach(subtab => {
    subtab.classList.toggle('active', subtab.dataset.subtab === subtabName);
  });
  
  // Sub-tab içeriklerini güncelle
  document.getElementById('active-keys-section').classList.toggle('active', subtabName === 'active');
  document.getElementById('archived-keys-section').classList.toggle('active', subtabName === 'archived');
}

// API Key Management
function showApiKeyForm() {
  document.getElementById('add-api-key-form').classList.remove('hidden');
  document.getElementById('new-api-key-input').value = '';
  document.getElementById('new-api-key-input').focus();
}

function hideApiKeyForm() {
  document.getElementById('add-api-key-form').classList.add('hidden');
}

async function saveApiKey() {
  const input = document.getElementById('new-api-key-input');
  const apiKey = input.value.trim();
  
  if (!apiKey) {
    alert('Lütfen API key girin');
    return;
  }
  
  // Check if already exists
  if (settings.apiKeys.find(k => k.key === apiKey)) {
    alert('Bu API key zaten ekli');
    return;
  }
  
  // Get limit info
  const info = await elevenLabsService.getSubscriptionInfo(apiKey);
  
  if (!info.success) {
    alert('API key doğrulanamadı: ' + info.error);
    return;
  }
  
  settings.apiKeys.push({
    key: apiKey,
    remainingLimit: info.remainingLimit,
    totalLimit: info.totalLimit,
    createdAt: new Date().toISOString()
  });
  
  await saveSettings();
  renderApiKeys();
  hideApiKeyForm();
  checkVideoCredits();
}

async function archiveApiKey(index) {
  const key = settings.apiKeys[index];
  settings.archivedApiKeys.push(key);
  settings.apiKeys.splice(index, 1);
  await saveSettings();
  renderApiKeys();
  checkVideoCredits();
}

async function restoreApiKey(index) {
  const key = settings.archivedApiKeys[index];
  
  // Geri alınan keyin güncel limitini çek
  const info = await elevenLabsService.getSubscriptionInfo(key.key);
  if (info.success) {
    key.remainingLimit = info.remainingLimit;
    key.totalLimit = info.totalLimit;
  }
  
  settings.apiKeys.push(key);
  settings.archivedApiKeys.splice(index, 1);
  await saveSettings();
  renderApiKeys();
  checkVideoCredits();
}

async function deleteArchivedKey(index) {
  settings.archivedApiKeys.splice(index, 1);
  await saveSettings();
  renderApiKeys();
}

async function checkAllApiLimits() {
  for (let i = 0; i < settings.apiKeys.length; i++) {
    const key = settings.apiKeys[i];
    const info = await elevenLabsService.getSubscriptionInfo(key.key);
    if (info.success) {
      settings.apiKeys[i].remainingLimit = info.remainingLimit;
      settings.apiKeys[i].totalLimit = info.totalLimit;
    }
  }
  await saveSettings();
  renderApiKeys();
  checkVideoCredits();
}

// Arşiv sayfalama
let currentArchivedPage = 1;
const itemsPerPage = 5;

function renderApiKeys() {
  const activeList = document.getElementById('api-keys-list');
  const archivedList = document.getElementById('archived-keys-list');
  
  activeList.innerHTML = '';
  archivedList.innerHTML = '';
  
  // Aktif keyleri limite göre sırala (büyükten küçüğe)
  const sortedKeys = [...settings.apiKeys].sort((a, b) => (b.remainingLimit || 0) - (a.remainingLimit || 0));
  
  sortedKeys.forEach((key) => {
    // Orijinal index'i bul (arşivleme için)
    const originalIndex = settings.apiKeys.indexOf(key);
    const item = createApiKeyItem(key, originalIndex, false);
    activeList.appendChild(item);
  });
  
  // Arşivlenmiş key'leri sayfalama ile göster
  renderArchivedKeys();
  
  // Toplam token ve süre hesapla
  updateTotalCredits();
}

function renderArchivedKeys() {
  const archivedList = document.getElementById('archived-keys-list');
  archivedList.innerHTML = '';
  
  const totalPages = Math.ceil(settings.archivedApiKeys.length / itemsPerPage);
  const startIndex = (currentArchivedPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageKeys = settings.archivedApiKeys.slice(startIndex, endIndex);
  
  pageKeys.forEach((key, pageIndex) => {
    const actualIndex = startIndex + pageIndex;
    const item = createApiKeyItem(key, actualIndex, true);
    archivedList.appendChild(item);
  });
  
  // Sayfalama kontrolleri
  if (settings.archivedApiKeys.length > itemsPerPage) {
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination-controls';
    paginationDiv.innerHTML = `
      <button class="btn btn-sm" ${currentArchivedPage === 1 ? 'disabled' : ''} onclick="prevArchivedPage()">◀ Önceki</button>
      <span class="page-info">Sayfa ${currentArchivedPage} / ${totalPages}</span>
      <button class="btn btn-sm" ${currentArchivedPage === totalPages ? 'disabled' : ''} onclick="nextArchivedPage()">Sonraki ▶</button>
    `;
    archivedList.appendChild(paginationDiv);
  }
}

function nextArchivedPage() {
  const totalPages = Math.ceil(settings.archivedApiKeys.length / itemsPerPage);
  if (currentArchivedPage < totalPages) {
    currentArchivedPage++;
    renderArchivedKeys();
  }
}

function prevArchivedPage() {
  if (currentArchivedPage > 1) {
    currentArchivedPage--;
    renderArchivedKeys();
  }
}

function updateTotalCredits() {
  const totalCredits = settings.apiKeys.reduce((sum, key) => sum + (key.remainingLimit || 0), 0);
  
  // 1000 token = 30 saniye
  // 1 token = 0.03 saniye = 0.0005 dakika
  const totalMinutes = (totalCredits / 1000) * 0.5; // 30 saniye = 0.5 dakika
  
  // Format
  const creditsDisplay = document.getElementById('total-credits-display');
  const durationDisplay = document.getElementById('credits-duration');
  
  if (creditsDisplay) {
    creditsDisplay.textContent = totalCredits.toLocaleString();
  }
  
  if (durationDisplay) {
    if (totalMinutes >= 60) {
      const hours = (totalMinutes / 60).toFixed(1);
      durationDisplay.textContent = `${hours} saat`;
    } else {
      durationDisplay.textContent = `${totalMinutes.toFixed(1)} dakika`;
    }
  }
}

function createApiKeyItem(key, index, isArchived) {
  const div = document.createElement('div');
  div.className = 'api-key-item';
  
  // Arşivlenmiş keyler için compact class ekle
  if (isArchived) {
    div.classList.add('archived');
  } else {
    // 1000 krediden az ise low-credit class ekle (30 saniye = 1000 kredi)
    if (key.remainingLimit < 1000) {
      div.classList.add('low-credit');
    }
  }
  
  const maskedKey = key.key.substring(0, 8) + '...' + key.key.substring(key.key.length - 4);
  
  // Tarih formatı
  let dateDisplay = '';
  if (key.createdAt) {
    const date = new Date(key.createdAt);
    dateDisplay = `<span class="api-key-date">📅 ${date.toLocaleDateString('tr-TR')}</span>`;
  }
  
  div.innerHTML = `
    <div class="api-key-info">
      <div class="api-key-value">${maskedKey}</div>
      ${isArchived ? dateDisplay : `<div class="api-key-limit">Kalan: ${key.remainingLimit || 0} kredi</div>`}
    </div>
    <div class="api-key-actions">
      ${isArchived 
        ? `<button class="btn-restore" onclick="restoreApiKey(${index})">Geri Al</button>
           <button class="btn-delete" onclick="deleteArchivedKey(${index})">Sil</button>`
        : `${dateDisplay}<button class="btn-archive" onclick="archiveApiKey(${index})">Arşivle</button>`
      }
    </div>
  `;
  
  return div;
}

function openApiHelp(e) {
  e.preventDefault();
  ipcRenderer.invoke('open-external-url', 'https://elevenlabs.io/app/developers/api-keys');
}

// Video Selection
async function selectVideoFile() {
  const filePath = await ipcRenderer.invoke('select-video-file');
  if (filePath) {
    await loadVideo(filePath);
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    await loadVideo(files[0].path);
  }
}

async function handleYouTubeInput(e) {
  const url = e.target.value.trim();
  
  // Önceki timeout'u iptal et
  if (youtubeInputTimeout) {
    clearTimeout(youtubeInputTimeout);
  }
  
  // Eğer URL boşsa veya YouTube URL'i değilse çık
  if (!url || !videoUtils.isYouTubeUrl(url)) {
    document.getElementById('download-youtube-btn').classList.add('hidden');
    return;
  }
  
  // 1 saniye bekle, sonra video bilgisini göster
  youtubeInputTimeout = setTimeout(async () => {
    try {
      const videoId = await videoUtils.extractYouTubeVideoId(url);
      
      if (videoId) {
        // Video bilgilerini göster ama yüklenmiş olarak işaretleme
        await showYouTubePreview(url);
      } else {
        alert('Geçersiz YouTube URL formatı');
      }
    } catch (error) {
      console.error('YouTube URL işleme hatası:', error);
      alert('YouTube video bilgisi alınırken hata: ' + error.message);
    }
  }, 1000);
}

async function showYouTubePreview(url) {
  // Loading indicator göster
  const youtubeInput = document.getElementById('youtube-url');
  const loadingIndicator = document.getElementById('youtube-loading');
  const originalPlaceholder = youtubeInput.placeholder;
  
  youtubeInput.disabled = true;
  loadingIndicator.classList.remove('hidden');
  
  try {
    const youtubeInfo = await videoUtils.getYouTubeVideoInfo(url);
    
    if (!youtubeInfo.success) {
      alert('YouTube video bilgisi alınamadı: ' + youtubeInfo.error);
      youtubeInput.disabled = false;
      loadingIndicator.classList.add('hidden');
      return;
    }
    
    // UI'yı güncelle - video bilgilerini göster
    const dropzone = document.getElementById('video-dropzone');
    const youtubeInput = document.getElementById('youtube-url');
    const videoInfo = document.getElementById('selected-video-info');
    
    dropzone.classList.add('hidden');
    youtubeInput.classList.add('hidden');
    videoInfo.classList.remove('hidden');
    
    // Video bilgilerini göster
    const fileName = youtubeInfo.title;
    const durationText = `Süre: ${videoUtils.formatDuration(youtubeInfo.duration)} • ${youtubeInfo.author}`;
    
    videoInfo.querySelector('.video-name').textContent = fileName;
    videoInfo.querySelector('.video-duration').textContent = durationText;
    
    // Thumbnail göster
    const thumbnail = document.getElementById('video-thumbnail');
    const videoIcon = document.getElementById('video-icon');
    
    if (youtubeInfo.thumbnail) {
      thumbnail.src = youtubeInfo.thumbnail;
      thumbnail.classList.remove('hidden');
      videoIcon.classList.add('hidden');
    } else {
      thumbnail.classList.add('hidden');
      videoIcon.classList.remove('hidden');
    }
    
    // İndirme butonunu göster
    document.getElementById('download-youtube-btn').classList.remove('hidden');
    
    // Dubbing butonunu devre dışı bırak - video henüz indirilmedi
    document.getElementById('start-dubbing-btn').disabled = true;
    
    // Video bilgilerini state'e kaydet (henüz selectedVideo olarak değil)
    window.pendingYouTubeVideo = {
      url: url,
      info: youtubeInfo,
      duration: youtubeInfo.duration,
      title: youtubeInfo.title
    };
    
    // Süre ve kredi hesaplamalarını göster
    videoDuration = youtubeInfo.duration;
    await checkVideoCredits();
    
    // Loading indicator'u kapat
    youtubeInput.disabled = false;
    loadingIndicator.classList.add('hidden');
    
  } catch (error) {
    alert('Video bilgisi alınırken hata: ' + error.message);
    youtubeInput.disabled = false;
    loadingIndicator.classList.add('hidden');
  }
}

async function loadVideo(videoPath, isYouTube = false) {
  try {
    // Progress bölümünü temizle
    document.getElementById('progress-section').classList.add('hidden');
    document.getElementById('progress-items').innerHTML = '';
    
    selectedVideo = { path: videoPath, isYouTube };
    
    // Get duration
    if (!isYouTube) {
      videoDuration = await videoUtils.getVideoDuration(videoPath);
    } else {
      // YouTube için video bilgilerini çek
      const youtubeInfo = await videoUtils.getYouTubeVideoInfo(videoPath);
      
      if (!youtubeInfo.success) {
        alert('YouTube video bilgisi alınamadı: ' + youtubeInfo.error);
        removeVideo();
        return;
      }
      
      videoDuration = youtubeInfo.duration;
      selectedVideo.info = youtubeInfo;
    }
    
    // Update UI
    document.getElementById('video-dropzone').classList.add('hidden');
    document.getElementById('youtube-url').classList.add('hidden');
    
    const videoInfo = document.getElementById('selected-video-info');
    videoInfo.classList.remove('hidden');
    
    let fileName;
    let durationText;
    
    if (isYouTube && selectedVideo.info) {
      fileName = selectedVideo.info.title;
      durationText = `Süre: ${videoUtils.formatDuration(videoDuration)} • ${selectedVideo.info.author}`;
    } else {
      fileName = path.basename(videoPath);
      durationText = `Süre: ${videoUtils.formatDuration(videoDuration)}`;
    }
    
    videoInfo.querySelector('.video-name').textContent = fileName;
    videoInfo.querySelector('.video-duration').textContent = durationText;
    
    // Thumbnail göster (sadece YouTube için)
    const thumbnail = document.getElementById('video-thumbnail');
    const videoIcon = document.getElementById('video-icon');
    
    if (isYouTube && selectedVideo.info && selectedVideo.info.thumbnail) {
      thumbnail.src = selectedVideo.info.thumbnail;
      thumbnail.classList.remove('hidden');
      videoIcon.classList.add('hidden');
    } else {
      thumbnail.classList.add('hidden');
      videoIcon.classList.remove('hidden');
    }
    
    await checkVideoCredits();
  } catch (error) {
    alert('Video yüklenirken hata: ' + error.message);
    removeVideo();
  }
}

function removeVideo() {
  selectedVideo = null;
  videoDuration = 0;
  window.pendingYouTubeVideo = null;
  window.userSegments = null;
  
  document.getElementById('video-dropzone').classList.remove('hidden');
  document.getElementById('youtube-url').classList.remove('hidden');
  document.getElementById('selected-video-info').classList.add('hidden');
  document.getElementById('credit-info').classList.add('hidden');
  document.getElementById('start-dubbing-btn').disabled = true;
  document.getElementById('segment-required-msg').classList.add('hidden');
  
  // İndirme butonunu gizle
  document.getElementById('download-youtube-btn').classList.add('hidden');
  
  // Progress bölümünü temizle
  document.getElementById('progress-section').classList.add('hidden');
  document.getElementById('progress-items').innerHTML = '';
}

// Segment Editor
async function openSegmentEditor() {
  if (!selectedVideo || videoDuration === 0) {
    alert('Lütfen önce bir video seçin');
    return;
  }
  
  // Tüm API anahtarlarını kredilerine göre sırala (büyükten küçüğe)
  // ONCE orijinal index'leri kaydet (settings.apiKeys içindeki gerçek pozisyon), SONRA sırala
  const apiKeysWithIndex = settings.apiKeys
    .map((key, idx) => ({ ...key, originalIndex: idx })) // Her key'in settings.apiKeys'teki index'ini kaydet
    .filter(key => !key.archived); // Arşivsiz olanları filtrele
  
  const sortedApiKeys = apiKeysWithIndex.sort((a, b) => (b.remainingLimit || 0) - (a.remainingLimit || 0));
  
  console.log('Segment Editor - Gönderilen API Keys:');
  sortedApiKeys.forEach((k, idx) => {
    console.log(`  [${idx}] originalIndex=${k.originalIndex}, limit=${k.remainingLimit}, key=${k.key.substring(0,8)}...`);
  });
  
  // Segment editor'a gönderilecek data
  const editorData = {
    path: selectedVideo.path,
    duration: videoDuration,
    title: selectedVideo.info ? selectedVideo.info.title : path.basename(selectedVideo.path),
    // API key'lerin tüm bilgilerini gönder (key dahil)
    apiKeys: sortedApiKeys.map(k => ({ 
      key: k.key, // Gerçek API key
      remainingLimit: k.remainingLimit || 0,
      originalIndex: k.originalIndex
    }))
  };
  
  // Segment editor penceresini aç
  await ipcRenderer.invoke('open-segment-editor', editorData);
  
  // Segment editor kapandıktan sonra segmentleri al
  window.addEventListener('focus', async () => {
    const segments = await ipcRenderer.invoke('get-segments');
    if (segments && segments.length > 0) {
      window.userSegments = segments;
      console.log('Kullanıcı segmentleri:', segments);
      await checkVideoCredits(); // UI'yı güncelle
    }
  }, { once: true });
}

async function checkVideoCredits() {
  if (!selectedVideo || videoDuration === 0) {
    // Eğer pending YouTube video varsa indirilmesi gerektiğini göster
    if (window.pendingYouTubeVideo) {
      const statusDiv = document.getElementById('credit-status');
      const creditInfo = document.getElementById('credit-info');
      creditInfo.classList.remove('hidden');
      statusDiv.textContent = '⚠️ Video henüz indirilmedi. Lütfen önce videoyu indirin.';
      statusDiv.className = 'credit-status warning';
      document.getElementById('start-dubbing-btn').disabled = true;
    }
    return;
  }
  
  if (settings.apiKeys.length === 0) {
    alert('Lütfen önce API key ekleyin');
    return;
  }
  
  const requiredCredits = elevenLabsService.calculateRequiredCredits(videoDuration);
  const totalCredits = settings.apiKeys.reduce((sum, key) => sum + (key.remainingLimit || 0), 0);
  
  const creditInfo = document.getElementById('credit-info');
  creditInfo.classList.remove('hidden');
  
  document.getElementById('total-credit').textContent = totalCredits.toLocaleString();
  document.getElementById('required-credit').textContent = requiredCredits.toLocaleString();
  
  const statusDiv = document.getElementById('credit-status');
  const startBtn = document.getElementById('start-dubbing-btn');
  const segmentRequiredMsg = document.getElementById('segment-required-msg');
  const segmentInfoDisplay = document.getElementById('segment-info-display');
  
  // Video bölünmesi gerekiyor mu kontrol et
  const segments = elevenLabsService.splitVideoByCredits(videoDuration, settings.apiKeys);
  const needsSegmentation = segments.length > 1;
  
  if (totalCredits >= requiredCredits) {
    statusDiv.textContent = '✓ Kredi yeterli';
    statusDiv.className = 'credit-status success';
    
    if (needsSegmentation) {
      if (window.userSegments && window.userSegments.length > 0) {
        // Kullanıcı segmentleri seçmiş - bilgileri göster
        segmentRequiredMsg.classList.add('hidden');
        segmentInfoDisplay.classList.remove('hidden');
        
        // Segment detaylarını göster
        displaySegmentInfo(window.userSegments);
        
        startBtn.disabled = false;
        statusDiv.textContent += ` • ${window.userSegments.length} segment hazır`;
      } else {
        // Henüz segment seçilmemiş - düzenleme mesajı göster
        segmentRequiredMsg.classList.remove('hidden');
        segmentInfoDisplay.classList.add('hidden');
        startBtn.disabled = true;
        statusDiv.textContent += ' • Lütfen segmentleri düzenleyin';
      }
    } else {
      // Segment gerekmiyor, direkt başlatabilir
      segmentRequiredMsg.classList.add('hidden');
      segmentInfoDisplay.classList.add('hidden');
      startBtn.disabled = false;
    }
  } else {
    const missing = requiredCredits - totalCredits;
    statusDiv.textContent = `✗ ${missing.toLocaleString()} kredi eksik. Lütfen daha fazla API key ekleyin`;
    statusDiv.className = 'credit-status error';
    startBtn.disabled = true;
    segmentRequiredMsg.classList.add('hidden');
    segmentInfoDisplay.classList.add('hidden');
  }
}

// Segment bilgilerini göster
function displaySegmentInfo(segments) {
  const detailsDiv = document.getElementById('segment-details');
  detailsDiv.innerHTML = '';
  
  // Toplam bilgiler
  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
  const totalCredits = segments.reduce((sum, seg) => sum + seg.credits, 0);
  
  detailsDiv.innerHTML = `
    <div class="segment-detail-item">
      <label>Toplam Segment</label>
      <strong>${segments.length}</strong>
    </div>
    <div class="segment-detail-item">
      <label>Toplam Süre</label>
      <strong>${videoUtils.formatDuration(totalDuration)}</strong>
    </div>
    <div class="segment-detail-item">
      <label>Toplam Kredi</label>
      <strong>${totalCredits.toLocaleString()}</strong>
    </div>
  `;
  
  // Her segmentin detayları
  segments.forEach((seg, idx) => {
    const segItem = document.createElement('div');
    segItem.className = 'segment-detail-item';
    segItem.innerHTML = `
      <label>Segment ${idx + 1}</label>
      <strong>${videoUtils.formatDuration(seg.start)} - ${videoUtils.formatDuration(seg.end)} (${seg.credits} kredi)</strong>
    `;
    detailsDiv.appendChild(segItem);
  });
}

// Dubbing Process
async function startDubbing() {
  if (!selectedVideo || videoDuration === 0) {
    alert('Lütfen bir video seçin');
    return;
  }
  
  const sourceLang = document.getElementById('source-language').value;
  const targetLang = document.getElementById('target-language').value;
  const speakerCount = parseInt(document.getElementById('speaker-count').value);
  
  console.log('Dublaj parametreleri:', { sourceLang, targetLang, speakerCount });
  
  if (!targetLang) {
    alert('Lütfen dublaj dili seçin');
    return;
  }
  
  // Disable button ve metni değiştir
  const dubbingBtn = document.getElementById('start-dubbing-btn');
  const originalBtnText = dubbingBtn.textContent;
  dubbingBtn.disabled = true;
  dubbingBtn.textContent = 'Dublaj Yapılıyor...';
  
  // API limitlerini güncelle
  console.log('API limitleri güncelleniyor...');
  await checkAllApiLimits();
  console.log('API limitleri güncellendi');
  
  // Show progress
  const progressSection = document.getElementById('progress-section');
  progressSection.classList.remove('hidden');
  
  const progressItems = document.getElementById('progress-items');
  progressItems.innerHTML = '';
  
  // Segmentleri belirle
  let segments;
  if (window.userSegments && window.userSegments.length > 0) {
    // Kullanıcı manuel segment seçmiş
    console.log('Manuel segmentler kullanılıyor:', window.userSegments);
    
    // Kullanıcı segmentlerini API formatına çevir
    // BASIT: Segment'teki apiKey string'ini direkt kullan!
    segments = window.userSegments.map((seg) => {
      // Segment editor'dan gelen gerçek API key string'ini kullan
      const apiKeyString = seg.apiKey;
      
      if (!apiKeyString) {
        console.error('Segment API key eksik:', seg);
        throw new Error('Segment için API key bulunamadı');
      }
      
      // Loglama için API key'in kalan limitini bul
      const matchingKey = settings.apiKeys.find(k => k.key === apiKeyString);
      const remainingLimit = matchingKey ? matchingKey.remainingLimit : '?';
      
      console.log(`Segment ${seg.start.toFixed(1)}-${seg.end.toFixed(1)} (${seg.credits} kredi) -> API Key ${apiKeyString.substring(0, 8)}... (kalan: ${remainingLimit})`);
      
      return {
        rangeStart: seg.start,
        rangeEnd: seg.end,
        duration: seg.end - seg.start,
        apiKey: apiKeyString
      };
    });
  } else {
    // Otomatik segment bölme
    segments = elevenLabsService.splitVideoByCredits(videoDuration, settings.apiKeys);
  }
  
  // Process segments in parallel
  const dubbingPromises = segments.map((segment, index) => {
    return processDubbingSegment(segment, index, sourceLang, targetLang, speakerCount, progressItems);
  });
  
  try {
    const results = await Promise.all(dubbingPromises);
    
    // All segments completed, now merge
    const output = await mergeSegments(results, targetLang);
    
    // API limitlerini güncelle
    await checkAllApiLimits();
    
    // Başarı mesajı
    let message = 'Dublaj tamamlandı!\n\n';
    if (output.videoPath) {
      message += `Video (MP4): ${output.videoPath}\n`;
      message += `Ses (MP3): ${output.audioPath}\n`;
    } else {
      message += `Ses (MP3): ${output.audioPath}\n`;
    }
    message += '\nKlasörü açmak ister misiniz?';
    
    const result = confirm(message);
    if (result) {
      ipcRenderer.invoke('open-folder', path.dirname(output.audioPath));
    }
  } catch (error) {
    alert('Dublaj sırasında hata: ' + error.message);
    // Hata durumunda da limitleri güncelle
    await checkAllApiLimits();
  } finally {
    // Butonu tekrar aktif et ve metni geri al
    const dubbingBtn = document.getElementById('start-dubbing-btn');
    dubbingBtn.disabled = false;
    dubbingBtn.textContent = originalBtnText || 'Dublaj Başlat';
  }
}

async function processDubbingSegment(segment, index, sourceLang, targetLang, speakerCount, container) {
  // Create progress item
  const progressItem = document.createElement('div');
  progressItem.className = 'progress-item';
  progressItem.innerHTML = `
    <div class="progress-header">
      <span>Parça ${index + 1} (${videoUtils.formatDuration(segment.duration)})</span>
      <span class="progress-status">Başlatılıyor...</span>
    </div>
    <div class="progress-bar">
      <div class="progress-bar-fill" style="width: 0%"></div>
    </div>
  `;
  container.appendChild(progressItem);
  
  const statusSpan = progressItem.querySelector('.progress-status');
  const progressFill = progressItem.querySelector('.progress-bar-fill');
  
  try {
    // Start dubbing
    statusSpan.textContent = 'API\'ye gönderiliyor...';
    progressFill.style.width = '10%';
    
    const result = await elevenLabsService.dubVideo(
      segment.apiKey,
      selectedVideo.path,
      sourceLang,
      targetLang,
      speakerCount,
      segment.rangeStart,
      segment.rangeEnd
    );
    
    if (!result.success) {
      // ElevenLabs URL hatası kontrolü
      if (result.error && (result.error.includes('invalid_url') || result.error.includes('invalid or audio/video metadata'))) {
        throw new Error('ElevenLabs bu videoyu işleyemedi. Lütfen videoyu bilgisayarınıza indirip dosya olarak yükleyin.');
      }
      throw new Error(result.error);
    }
    
    const dubbingId = result.dubbingId;
    
    // Poll status
    statusSpan.textContent = 'İşleniyor...';
    progressFill.style.width = '30%';
    
    let status = 'dubbing';
    let pollCount = 0;
    while (status === 'dubbing') {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 saniye bekle
      pollCount++;
      
      console.log(`Polling ${index + 1}. parça (${pollCount}. deneme)...`);
      const statusResult = await elevenLabsService.getDubbingStatus(segment.apiKey, dubbingId);
      console.log('Status result:', statusResult);
      
      if (statusResult.success) {
        status = statusResult.status;
        console.log('Yeni status:', status);
        progressFill.style.width = '60%';
      } else {
        console.error('Status sorgulanamadı:', statusResult.error);
        // Hata varsa 3 deneme sonra çık
        if (pollCount > 3) {
          throw new Error('Status sorgulanamıyor: ' + statusResult.error);
        }
      }
    }
    
    if (status !== 'dubbed') {
      throw new Error('Dublaj başarısız: ' + status);
    }
    
    // Download
    statusSpan.textContent = 'İndiriliyor...';
    progressFill.style.width = '80%';
    
    const downloadResult = await elevenLabsService.downloadDubbedAudio(
      segment.apiKey,
      dubbingId,
      targetLang,
      false
    );
    
    if (!downloadResult.success) {
      throw new Error(downloadResult.error);
    }
    
    // Save to temp file - mp3 formatında kaydet
    const tempDir = require('os').tmpdir();
    const tempPath = path.join(tempDir, `dubbing_segment_${index}.mp3`);
    
    console.log('Temp dosya kaydediliyor:', tempPath);
    console.log('Data boyutu:', downloadResult.data.length);
    
    fs.writeFileSync(tempPath, Buffer.from(downloadResult.data));
    
    // Dosyanın gerçekten kaydedildiğini kontrol et
    if (!fs.existsSync(tempPath)) {
      throw new Error('Temp dosya kaydedilemedi: ' + tempPath);
    }
    
    console.log('Temp dosya kaydedildi:', tempPath, 'Boyut:', fs.statSync(tempPath).size);
    
    statusSpan.textContent = '✓ Tamamlandı';
    progressFill.style.width = '100%';
    
    return {
      index,
      path: tempPath,
      segment
    };
  } catch (error) {
    const errorMsg = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
    statusSpan.textContent = '✗ Hata: ' + errorMsg;
    progressFill.style.width = '100%';
    progressFill.style.backgroundColor = '#ef4444';
    console.error('Segment işleme hatası:', error);
    throw error;
  }
}

async function mergeSegments(results, targetLang) {
  // Sort by index
  results.sort((a, b) => a.index - b.index);
  
  // Output klasörünü al (ayarlardan veya varsayılan)
  let dubbedDir = settings.outputFolder;
  if (!dubbedDir) {
    const defaultFolders = await ipcRenderer.invoke('get-default-folders');
    dubbedDir = defaultFolders.dubbed;
  }
  if (!fs.existsSync(dubbedDir)) {
    fs.mkdirSync(dubbedDir, { recursive: true });
  }
  
  // dubbed klasörüne kaydet - mp3 formatında
  const timestamp = new Date().getTime();
  const audioFileName = `dubbed_${targetLang}_${timestamp}.mp3`;
  const dubbedPath = path.join(dubbedDir, audioFileName);
  
  console.log('Output path:', dubbedPath);
  console.log('Dubbed dir exists:', fs.existsSync(dubbedDir));
  
  // Tek parça varsa birleştirme yapma, direkt taşı
  if (results.length === 1) {
    const tempFile = results[0].path;
    
    console.log('Tek parça - temp dosya:', tempFile);
    console.log('Temp dosya var mı:', fs.existsSync(tempFile));
    
    if (!fs.existsSync(tempFile)) {
      throw new Error('Temp dosya bulunamadı: ' + tempFile);
    }
    
    fs.copyFileSync(tempFile, dubbedPath);
    console.log('Dosya kopyalandı:', dubbedPath);
    
    // Cleanup temp file
    await videoUtils.cleanupTempFiles([tempFile]);
    
    return dubbedPath;
  }
  
  // Progress göster
  const progressSection = document.getElementById('progress-section');
  const progressItems = document.getElementById('progress-items');
  
  const mergeItem = document.createElement('div');
  mergeItem.className = 'progress-item';
  mergeItem.innerHTML = `
    <div class="progress-header">
      <span>Ses dosyaları birleştiriliyor...</span>
      <span class="progress-status">İşleniyor...</span>
    </div>
    <div class="progress-bar">
      <div class="progress-bar-fill" style="width: 50%"></div>
    </div>
  `;
  progressItems.appendChild(mergeItem);
  
  try {
    // Merge using ffmpeg - audio olarak
    await videoUtils.mergeAudioSegments(results, dubbedPath);
    
    mergeItem.querySelector('.progress-status').textContent = '✓ Tamamlandı';
    mergeItem.querySelector('.progress-bar-fill').style.width = '100%';
    
    // Cleanup temp files
    const tempFiles = results.map(r => r.path);
    await videoUtils.cleanupTempFiles(tempFiles);
    
    // Video ile birleştirme yap (eğer video seçilmişse)
    if (selectedVideo && selectedVideo.path) {
      const videoMergeItem = document.createElement('div');
      videoMergeItem.className = 'progress-item';
      videoMergeItem.innerHTML = `
        <div class="progress-header">
          <span>Video ile birleştiriliyor...</span>
          <span class="progress-status">İşleniyor...</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width: 0%"></div>
        </div>
      `;
      progressItems.appendChild(videoMergeItem);
      
      try {
        const videoFileName = `dubbed_${targetLang}_${timestamp}.mp4`;
        const finalVideoPath = path.join(dubbedDir, videoFileName);
        
        await videoUtils.mergeVideoWithAudio(
          selectedVideo.path,
          dubbedPath,
          finalVideoPath,
          (percent) => {
            videoMergeItem.querySelector('.progress-bar-fill').style.width = percent + '%';
          }
        );
        
        videoMergeItem.querySelector('.progress-status').textContent = '✓ Tamamlandı';
        videoMergeItem.querySelector('.progress-bar-fill').style.width = '100%';
        
        return { audioPath: dubbedPath, videoPath: finalVideoPath };
      } catch (error) {
        videoMergeItem.querySelector('.progress-status').textContent = '✗ Video birleştirme hatası';
        videoMergeItem.querySelector('.progress-bar-fill').style.backgroundColor = '#ef4444';
        console.error('Video birleştirme hatası:', error);
        // Ses dosyasını yine de döndür
        return { audioPath: dubbedPath, videoPath: null };
      }
    }
    
    return { audioPath: dubbedPath, videoPath: null };
  } catch (error) {
    mergeItem.querySelector('.progress-status').textContent = '✗ Hata';
    mergeItem.querySelector('.progress-bar-fill').style.backgroundColor = '#ef4444';
    throw error;
  }
}

async function downloadYouTubeVideo() {
  // Pending video varsa onun URL'ini kullan, yoksa input'tan al
  const url = window.pendingYouTubeVideo?.url || document.getElementById('youtube-url').value.trim();
  
  if (!url || !videoUtils.isYouTubeUrl(url)) {
    alert('Lütfen geçerli bir YouTube URL\'si girin');
    return;
  }
  
  // Dosya adını belirle
  const videoId = await videoUtils.extractYouTubeVideoId(url);
  let fileName = `youtube_${videoId}.mp4`;
  
  // Pending video'dan daha açıklayıcı isim al
  if (window.pendingYouTubeVideo?.title) {
    // Dosya adı için geçersiz karakterleri temizle
    const sanitizedTitle = window.pendingYouTubeVideo.title
      .replace(/[<>:"\/\\|?*]/g, '') // Windows için geçersiz karakterler
      .replace(/\s+/g, '_') // Boşlukları alt çizgi yap
      .substring(0, 100); // Maksimum 100 karakter
    fileName = `${sanitizedTitle}.mp4`;
  }
  
  // Kaydetme yerini belirle
  let savePath;
  if (settings.downloadFolder) {
    // Ayarlarda belirtilen klasöre kaydet
    savePath = path.join(settings.downloadFolder, fileName);
  } else {
    // Varsayılan indirilenler klasörüne kaydet
    const downloadsPath = await ipcRenderer.invoke('get-downloads-path');
    savePath = path.join(downloadsPath, fileName);
  }
  
  // İndirme butonunu devre dışı bırak
  const downloadBtn = document.getElementById('download-youtube-btn');
  const originalText = downloadBtn.textContent;
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'İndiriliyor...';
  
  try {
    await videoUtils.downloadYouTubeVideo(url, savePath, 'highest', (percent, downloaded, total) => {
      downloadBtn.textContent = `İndiriliyor... ${percent}%`;
    });
    
    // İndirilen videoyu otomatik yükle
    await loadVideo(savePath, false);
    
    // Pending video state'ini temizle
    window.pendingYouTubeVideo = null;
    
    // URL alanını temizle
    document.getElementById('youtube-url').value = '';
    
  } catch (error) {
    alert('Video indirilemedi: ' + error.message);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = originalText;
  }
}

// Merge Tab Fonksiyonları
async function selectMergeVideo() {
  const filePath = await ipcRenderer.invoke('select-video-file');
  if (filePath) {
    mergeVideoPath = filePath;
    document.getElementById('merge-video-path').value = filePath;
    checkMergeReadiness();
  }
}

async function selectMergeAudio() {
  const result = await ipcRenderer.invoke('select-audio-file');
  if (result) {
    mergeAudioPath = result;
    document.getElementById('merge-audio-path').value = result;
    checkMergeReadiness();
  }
}

function checkMergeReadiness() {
  const canMerge = mergeVideoPath && mergeAudioPath;
  document.getElementById('start-merge-btn').disabled = !canMerge;
}

async function startMerge() {
  if (!mergeVideoPath || !mergeAudioPath) {
    alert('Lütfen hem video hem de ses dosyası seçin');
    return;
  }
  
  // Output klasörünü al
  let mergeDir = settings.mergeOutputFolder;
  if (!mergeDir) {
    const defaultFolders = await ipcRenderer.invoke('get-default-folders');
    mergeDir = defaultFolders.merged;
  }
  if (!fs.existsSync(mergeDir)) {
    fs.mkdirSync(mergeDir, { recursive: true });
  }
  
  const timestamp = new Date().getTime();
  const outputFileName = `merged_${timestamp}.mp4`;
  const outputPath = path.join(mergeDir, outputFileName);
  
  // Butonu devre dışı bırak
  const startBtn = document.getElementById('start-merge-btn');
  startBtn.disabled = true;
  startBtn.textContent = 'Birleştiriliyor...';
  
  // Progress göster
  const progressSection = document.getElementById('merge-progress-section');
  const progressItems = document.getElementById('merge-progress-items');
  progressSection.classList.remove('hidden');
  progressItems.innerHTML = '';
  
  const progressItem = document.createElement('div');
  progressItem.className = 'progress-item';
  progressItem.innerHTML = `
    <div class="progress-header">
      <span>Video ve ses birleştiriliyor...</span>
      <span class="progress-status">İşleniyor...</span>
    </div>
    <div class="progress-bar">
      <div class="progress-bar-fill" style="width: 0%"></div>
    </div>
  `;
  progressItems.appendChild(progressItem);
  
  try {
    await videoUtils.mergeVideoWithAudio(
      mergeVideoPath,
      mergeAudioPath,
      outputPath,
      (percent) => {
        progressItem.querySelector('.progress-bar-fill').style.width = percent + '%';
      }
    );
    
    progressItem.querySelector('.progress-status').textContent = '✓ Tamamlandı';
    progressItem.querySelector('.progress-bar-fill').style.width = '100%';
    
    // Başarı mesajı
    const result = await ipcRenderer.invoke('show-message-box', {
      type: 'info',
      title: 'Birleştirme Tamamlandı',
      message: 'Video başarıyla birleştirildi!',
      detail: `Dosya: ${outputPath}`,
      buttons: ['Klasörü Aç', 'Tamam']
    });
    
    if (result === 0) {
      await ipcRenderer.invoke('open-folder', mergeDir);
    }
    
    // Formu sıfırla
    mergeVideoPath = null;
    mergeAudioPath = null;
    document.getElementById('merge-video-path').value = '';
    document.getElementById('merge-audio-path').value = '';
    checkMergeReadiness();
    
  } catch (error) {
    progressItem.querySelector('.progress-status').textContent = '✗ Hata: ' + error.message;
    progressItem.querySelector('.progress-bar-fill').style.backgroundColor = '#ef4444';
    alert('Birleştirme hatası: ' + error.message);
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = 'Birleştir';
  }
}

// Make functions global for onclick handlers
window.archiveApiKey = archiveApiKey;
window.restoreApiKey = restoreApiKey;
window.deleteArchivedKey = deleteArchivedKey;
window.nextArchivedPage = nextArchivedPage;
window.prevArchivedPage = prevArchivedPage;
