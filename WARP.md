# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**DubMe** is an Electron-based desktop application for video dubbing using ElevenLabs API. It supports local video files and YouTube videos, automatically splits long videos across multiple API keys based on credit limits, and processes segments in parallel.

**Key Features:**
- Multi-API key management with automatic credit tracking
- Intelligent video segmentation based on API limits and silence detection
- Visual segment editor with waveform display and draggable cut points
- YouTube video support (preview, download via yt-dlp, dub)
- Parallel segment processing for faster results
- Separate merge tool for combining video + audio tracks
- Dark/light theme with persistent settings

**Tech Stack:**
- Electron (desktop framework)
- ElevenLabs SDK (video dubbing API)
- FFmpeg (video/audio processing)
- yt-dlp (YouTube downloads)
- Web Audio API (segment editor playback)
- Canvas API (waveform visualization)

## Quick Start

```powershell
# Install dependencies
npm install

# Start application
npm start

# Build installer
npm run build
```

**Prerequisites:**
- FFmpeg must be in system PATH
- yt-dlp must be in system PATH (for YouTube downloads)
- ElevenLabs API key(s)

**First-time Setup:**
1. Run `npm start`
2. Click Settings (⚙️) → API Keys → Add API Key
3. Paste your ElevenLabs API key
4. Select a video (local file, drag-drop, or YouTube URL)
5. Configure languages and speaker count
6. Click "Dublaj Başlat"

## Development Commands

### Running the Application
```powershell
# Start application normally
npm start

# Start in development mode (opens DevTools)
npm run dev
```

### Building
```powershell
# Build Windows installer
npm run build
```

### Dependencies
```powershell
# Install dependencies
npm install
```

**Important:** FFmpeg and yt-dlp must be installed and available in system PATH for video processing and YouTube downloads.

## Architecture Overview

### Electron Structure

**Main Process** (`src/main/main.js`):
- Manages application lifecycle and window creation
- Handles IPC communication for file dialogs, settings persistence, and external URL opening
- Implements Node.js timer polyfill for Undici compatibility in Electron environment
- Auto-cleanup for ytdl-core cache files (`*-player-script.js`)
- Settings stored in `app.getPath('userData')/settings.json`

**Renderer Process** (`src/renderer/`):
- `index.html` - Main UI with tabbed interface (Dubbing/Merge)
- `renderer.js` - UI logic, state management, event handlers (~1000+ lines)
- `styles.css` - Theme system (dark/light mode with CSS variables)

**Main Window Features:**
- **Multi-tab Interface:** Dubbing (default) and Merge tabs for different workflows
- **Video Input Methods:**
  - File picker dialog
  - Drag-and-drop zone
  - YouTube URL input with auto-preview (debounced 1s)
- **Settings Modal:** Tabbed interface (General, API Keys, Advanced)
  - Theme switcher (dark/light)
  - Output folder customization (defaults to project `dubbed/` and `merged/` folders)
  - Download folder for YouTube videos
  - Exclude low-credit keys option (visual indicator for keys with <1000 credits)
- **API Key Management:**
  - Add/Archive/Restore keys
  - Auto-fetch remaining limits on settings open
  - Pagination for archived keys (5 per page)
  - Visual indicators for low-credit keys (<1000 credits = ~30s)
  - Masked key display (first 8 + last 4 chars)
  - Creation date tracking
- **Credit Calculator:**
  - Real-time credit requirement display
  - Total available credits across all active keys
  - Auto-segmentation preview (shows if video needs splitting)
- **Progress Tracking:**
  - Parallel segment processing with individual progress bars
  - Status updates: "Başlatılıyor" → "API'ye gönderiliyor" → "İşleniyor" → "İndiriliyor" → "Tamamlandı"
  - 5-second polling interval for dubbing status

### Feature Modules

**Dubbing Service** (`src/features/dubbing/elevenlabs-service.js`):
- ElevenLabs SDK wrapper with client caching per API key (singleton pattern)
- **Credit Calculation:** 30 seconds = 1000 credits (≈33.33 credits/second, no buffer - exact calculation)
- **Video Splitting Algorithm:**
  - Minimum segment duration: 30 seconds
  - Sorts API keys by limit (descending)
  - Greedy allocation: uses fewest keys needed
  - If single key sufficient, no splitting occurs
  - Validates total credits before processing
  - Handles edge case: <30s remaining added to previous segment
  - Returns: `[{apiKey, rangeStart, rangeEnd, duration, requiredCredits}]`
- **API Methods:**
  - `getSubscriptionInfo(apiKey)`: Fetches character limit/count from ElevenLabs
  - `dubVideo(apiKey, videoFile, sourceLang, targetLang, numSpeakers, rangeStart?, rangeEnd?)`: 
    - Supports local files (auto-detects MIME type) and YouTube URLs
    - YouTube URL cleaning (extracts video ID, converts shorts)
    - Automatic retry on `invalid_url` errors (max 2 retries with 2s delay)
    - Creates File-like Blob objects for SDK compatibility
    - Returns `{success, dubbingId}` or `{success: false, error}`
  - `getDubbingStatus(apiKey, dubbingId)`: Polls dubbing status
  - `downloadDubbedAudio(apiKey, dubbingId, languageCode)`: Handles multiple stream types (Buffer, ReadableStream, Node.js stream)
  - `calculateRequiredCredits(durationInSeconds)`: Math.ceil(duration * 33.33)
  - `splitVideoByCredits(durationInSeconds, apiKeys)`: Main segmentation logic

**Video Utilities** (`src/features/dubbing/video-utils.js`):
- **FFmpeg Operations:**
  - `getVideoDuration(videoPath)`: Uses ffprobe to extract metadata
  - `mergeVideoSegments(segments, outputPath, isAudioOnly?)`: Concatenates video/audio files
  - `mergeAudioSegments(segments, outputPath)`: Concat filter for audio-only (libmp3lame, 192k)
  - `mergeVideoWithAudio(videoPath, audioPath, outputPath, onProgress?)`: Replaces audio track
    - Uses `-c:v copy` (no re-encoding, fast)
    - AAC audio codec, 192k bitrate
    - `-shortest` flag to match stream lengths
- **YouTube Integration:**
  - `getYouTubeVideoInfo(url)`: Fetches title, duration, thumbnail, author, viewCount using ytdl-core
  - `extractYouTubeVideoId(url)`: Regex-based ID extraction (watch, shorts, embed, /v/ formats)
  - `isYouTubeUrl(url)`: Simple domain check
  - `downloadYouTubeVideo(url, outputPath, quality?, onProgress?)`: Uses `yt-dlp` CLI
    - Spawns subprocess with progress parsing
    - `--no-playlist` and `--no-check-certificates` flags
    - Supports quality selection by itag or 'highest' (default)
  - `getAvailableQualities(url)`: Lists available formats with size info
- **Helper Methods:**
  - `formatDuration(seconds)`: Returns MM:SS or HH:MM:SS string
  - `cleanupTempFiles(files)`: Deletes files safely (ignores errors)

### Services

**Video Analyzer** (`src/services/video-analyzer.js`):
- Audio extraction from video using FFmpeg
- Waveform generation (normalized amplitude data for visualization)
- Silence detection using FFmpeg's silencedetect filter
- Cut point suggestions based on silence intervals
- Returns analysis data: `{waveform: Float32[], silences: [{start, end, middle}]}`

### Segment Editor Window

**UI** (`src/renderer/segment-editor.html`, `segment-editor.js`, `segment-editor.css`):
- Separate BrowserWindow for manual segment editing (modal: false, parent: mainWindow)
- Waveform visualization with canvas rendering
- Interactive draggable cut point markers (vertical lines)
- Audio playback with Web Audio API
- Automatic segmentation based on API key limits and silence detection
- Color-coded segments (each API key gets distinct color)
- Playback indicator showing current audio position
- Space bar to pause/resume audio
- Click/drag on waveform to seek position

### Key Workflows

**Segment Editor Workflow:**
1. User opens segment editor from main window (optional - auto-segmentation also available)
2. Video is analyzed: audio extraction → waveform generation → silence detection
3. Auto-segmentation algorithm runs: calculates optimal cut points based on API limits and silence intervals
4. User sees waveform with:
   - Gray overlays: silence regions (no speech)
   - Colored rectangles: segments assigned to API keys
   - Draggable vertical markers: cut points between segments
5. User can:
   - Drag cut points to adjust segment boundaries (snaps to nearest silence)
   - Add new segments (if unused API keys available)
   - Listen to individual segments
   - Seek/play audio with timeline controls
6. On "Finish", segments are sent back to main window and processing begins

**Video Splitting Algorithm:**
1. Calculate total required credits for video duration (30s = 1000 credits)
2. Select minimum number of API keys needed (greedy: smallest first until sufficient)
3. Sort selected API keys by limit (descending)
4. For each API key:
   - Calculate max duration based on its credit limit
   - Search for nearest silence within ±5s window (prioritizes longest silence)
   - Ensure cut point doesn't exceed API limit
   - Add cut point and move to next API
5. Generate segments with `{apiKey, rangeStart, rangeEnd, duration, requiredCredits, color}`

**Parallel Processing:**
- Each segment is processed independently with its assigned API key
- Segments use ElevenLabs range parameters (startTime/endTime) to avoid physical file splitting
- Progress tracked individually per segment in UI
- Results merged using FFmpeg after all segments complete

**YouTube Video Workflow:**
1. User pastes YouTube URL (validated after 1s debounce)
2. Extract video ID and fetch info using ytdl-core
3. Display preview: thumbnail, title, author, duration
4. Show "Download" button (dubbing disabled until downloaded)
5. User clicks download → spawns `yt-dlp` subprocess
6. Progress bar updates via regex parsing (`(\d+\.?\d*)%`)
7. Video saved to `downloadFolder` or OS default downloads
8. After download completes, dubbing enabled
9. Processing continues as normal local video

**Merge Tab Workflow:**
1. User selects video file (MP4, etc.)
2. User selects audio file (MP3, MP4, etc.)
3. User specifies output path
4. FFmpeg merges: `-map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest`
5. Progress bar shows encoding status
6. On completion, option to open output folder

**Settings Persistence:**
- API keys stored with `{key, remainingLimit, totalLimit}`
- Supports archiving/restoring API keys (archived keys not used in processing)
- Theme preference persisted
- Auto-refresh limits when settings modal opens

## Code Patterns

### IPC Communication
All renderer-to-main communication uses `ipcMain.handle` / `ipcRenderer.invoke` pattern:
- `select-video-file` - File picker dialog
- `open-external-url` - Open links in browser
- `save-settings` / `load-settings` - Settings persistence
- `save-file-dialog` - Save location picker
- `open-segment-editor` - Opens segment editor window with video data
- `get-segment-editor-data` - Retrieves video data in segment editor context
- `set-segments` / `get-segments` - Pass segments between windows
- `close-segment-editor` - Closes segment editor (uses `ipcRenderer.send`)
- `analyze-video` - Runs video analysis (waveform + silence detection)
- `extract-audio-for-preview` - Extracts audio from video for playback

### Async/Await Pattern
All async operations use modern async/await, not callbacks or raw promises chains.

### Error Handling
Services return structured objects: `{success: boolean, ...data, error?: string}`

### State Management

**Main Window State (`renderer.js`):**
```javascript
settings = {
  apiKeys: [{key, remainingLimit, totalLimit, createdAt}],
  archivedApiKeys: [{...}],
  excludeLowCreditKeys: true,
  outputFolder: null, // null = use project default (dubbed/)
  downloadFolder: null, // null = use OS downloads folder
  mergeOutputFolder: null, // null = use project default (merged/)
  theme: 'dark' | 'light'
}

selectedVideo = {
  path: string, // file path or YouTube URL
  isYouTube: boolean,
  info?: { // Only for YouTube
    title: string,
    duration: number,
    thumbnail: string,
    author: string,
    viewCount: number
  }
}

videoDuration = number // in seconds

// Window-scoped variables:
window.pendingYouTubeVideo = {...} // Preview before download
window.userSegments = [{start, end, duration, credits, apiKey, color}] // From segment editor
```

**Segment Editor State (`segment-editor.js`):**
```javascript
videoData = { path, duration, title, apiKeys }
analysisData = { waveform: Float32[], silences: [{start, end, middle}] }
segments = [{id, start, end, duration, credits, color, apiKeyIndex, apiKey, apiLimit}]
suggestedCutPoints = [0, time1, time2, ..., duration]
selectedApis = [...apiKeys] // Subset used for segmentation

// Audio playback state:
audioContext, audioBuffer, audioSource
isPlayingAudio, isPaused, currentPlaybackPosition, pausedAtTime

// Drag state:
isDraggingCutPoint, draggedCutPointIndex
```

**Persistence:**
- Settings saved to `app.getPath('userData')/settings.json`
- Auto-saved on every change (theme, API keys, folders)
- Loaded on app startup

## Language Support

**Source Languages:** Turkish (tr), English (en), German (de), French (fr), Spanish (es)
**Target Languages:** Turkish (tr), English (en), German (de), French (fr), Spanish (es)
**Speaker Count:** 1-10 (default: 1)

**Note:** Source language is optional parameter for ElevenLabs API. If not specified, API auto-detects.

## Supported Formats

**Video Input:**
- MP4 (video/mp4)
- MOV (video/quicktime)
- AVI (video/x-msvideo)
- MKV (video/x-matroska)
- WEBM (video/webm)
- FLV (video/x-flv)

**Audio Input/Output:**
- MP3 (libmp3lame, 192k bitrate)
- AAC (aac codec, 192k bitrate for video merge)
- WAV (PCM 16-bit, analysis only)

**YouTube:**
- Standard watch URLs: `youtube.com/watch?v=...`
- Short URLs: `youtu.be/...`
- Shorts: `youtube.com/shorts/...`
- Embed: `youtube.com/embed/...`
- Direct /v/ URLs: `youtube.com/v/...`

## Important Notes

- **File Paths:** Avoid Turkish/special characters in video file paths (can cause FFmpeg issues)
- **YouTube:** 
  - Uses `@distube/ytdl-core` with `YTDL_NO_UPDATE=1` to suppress update checks
  - **Download requires `yt-dlp` CLI** (not ytdl-core) for reliability
  - URL cleaning extracts video ID and reconstructs clean URL (removes tracking params)
- **Timer Polyfill:** Custom `setTimeout` polyfill adds `unref()`, `ref()`, `hasRef()` methods for Undici compatibility in Electron
- **Cache Cleanup:** Auto-removes ytdl-core player script cache files (`*-player-script.js`) on app quit
- **Credit Calculation:** Exactly 33.33 credits/second, NO buffer (changed from 1% buffer in earlier versions)
- **Segment Editor:** 
  - Always opens with DevTools for debugging
  - Uses Web Audio API for playback (not HTML5 `<audio>` element)
  - Pause/resume creates new AudioBufferSourceNode (cannot resume existing sources)
  - Canvas event listeners check for `isDraggingCutPoint` to prevent conflicts
- **Waveform Rendering:** High-DPI aware canvas rendering with `devicePixelRatio` scaling
- **Silence Detection:** FFmpeg silencedetect filter with -40dB threshold and 0.5s minimum duration
- **Audio Extraction:** Temporary WAV files (PCM 16-bit, 44.1kHz, mono) created in OS temp directory
- **API Key Masking:** UI shows first 8 + last 4 chars, but full key stored in settings and used in API calls
- **Low Credit Threshold:** Keys with <1000 credits flagged as "low-credit" (visual indicator)
- **Manual Segmentation:**
  - If `window.userSegments` exists, auto-segmentation is bypassed
  - User segments have `apiKey` string directly embedded (not index lookup)
  - Segment editor returns segments with actual API key strings, not references
- **ElevenLabs Errors:**
  - `invalid_url` errors trigger automatic retry (max 2 retries, 2s delay)
  - If persistent, suggests downloading video locally instead of URL
- **Dubbing Status Polling:** 5-second interval, no timeout (waits indefinitely)

## Dependencies

**Core:**
- `electron` - Desktop app framework
- `@elevenlabs/elevenlabs-js` - ElevenLabs SDK
- `fluent-ffmpeg` - Video processing wrapper
- `@distube/ytdl-core` - YouTube video handling
- `axios` - HTTP requests
- `form-data` - Multipart form data
- `lucide-static` - Icon library

**Build:**
- `electron-builder` - Creates Windows NSIS installer

**System Requirements:**
- `ffmpeg` - Must be in PATH for video/audio processing
- `yt-dlp` - Must be in PATH for YouTube downloads

## File Structure

```
src/
├── main/
│   └── main.js                      # Electron main process & IPC handlers
├── renderer/
│   ├── index.html                   # Main window UI
│   ├── renderer.js                  # Main window logic & state
│   ├── styles.css                   # Theme system (dark/light)
│   ├── segment-editor.html          # Segment editor UI
│   ├── segment-editor.js            # Segment editor logic
│   └── segment-editor.css           # Segment editor styles
├── features/
│   └── dubbing/
│       ├── elevenlabs-service.js    # API wrapper, credit logic
│       └── video-utils.js           # FFmpeg & YouTube utilities
└── services/
    └── video-analyzer.js            # Audio analysis, waveform, silence detection
```

## When Making Changes

### General Guidelines
- Maintain modular structure under `src/features/` for new features
- Use structured error responses from service functions: `{success: boolean, ...data, error?: string}`
- All async operations use async/await (not callbacks or promise chains)
- Test with both local files and YouTube URLs
- Verify FFmpeg operations work on Windows (use `spawn` for long-running processes)
- When adding new IPC handlers, document them in this file and in IPC Communication section

### Testing Checklist

**Credit Calculations:**
- Edge cases: <30s videos, exact 30s multiples, very long videos (>1hr)
- Boundary conditions: exactly at API limit, 1 credit over, 1 credit under
- Multiple keys with varying limits (test greedy allocation)
- Single key sufficient vs. requiring multiple keys

**Segment Editor:**
- Test marker dragging with various API limit configurations
- Ensure cut points never exceed assigned API key's credit limit
- Verify audio playback pause/resume state management (new AudioBufferSourceNode on resume)
- Test with videos that have minimal or excessive silence
- Canvas click/drag should not interfere with marker dragging
- Window resize should update marker positions correctly
- Space bar pause/resume
- Segment colors cycle correctly for >7 segments (7 colors defined in `segmentColors` array)

**YouTube Workflows:**
- Invalid URLs (malformed, non-YouTube domains)
- Private/deleted videos
- Age-restricted videos
- Different URL formats (watch, shorts, youtu.be, embed)
- yt-dlp not installed scenario
- Download progress parsing

**API Key Management:**
- Archive/restore flows
- Limit refresh (all keys at once)
- Low-credit visual indicators (<1000 credits)
- Pagination for archived keys
- Duplicate key validation

**Multi-language:**
- All 5 source/target language combinations
- Optional vs. specified source language
- Multiple speaker counts (1, 2, 5, 10)

**Error Scenarios:**
- FFmpeg not in PATH
- yt-dlp not in PATH
- Invalid API keys
- Network failures during dubbing
- Disk full during file writes
- Invalid video file formats
