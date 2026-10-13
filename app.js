const DB_NAME = 'cutboard-local-videos';
const STORE_NAME = 'videos';
const MAX_VIDEOS = 40;
const BUILTIN_VIDEOS = [{
  id: 'diamond-analysis-preset',
  name: 'Diamond Analysis',
  type: 'video/mp4',
  size: 2645834,
    url: 'diamond-analysis.mp4',
    resultUrl: 'result-excellent.jpg',
  playDuration: 30,
  builtin: true,
  report: { findings: ['NATURAL', 'REVITALIZED', 'HIGHLY PURIFIED', 'SAFE'], grade: 'EXCELLENT', result: 'MAN MADE DIAMOND', tone: 'good' },
}, {
  id: 'diamond-analysis-bad-preset',
  name: 'Synthetic Diamond',
  type: 'video/mp4',
  size: 2645834,
  url: 'diamond-analysis.mp4',
  resultUrl: 'result-bad.jpg',
  playDuration: 30,
  builtin: true,
  report: { findings: ['SYNTHETIC', 'BAD INCLUSIONS', 'NOT PURIFIED', 'HARMFUL SUBSTANCES'], grade: 'BAD', result: 'SYNTHETIC DIAMOND', tone: 'bad' },
}, {
  id: 'diamond-analysis-neutral-preset',
  name: 'Neutral',
  type: 'video/mp4',
  size: 2645834,
  url: 'diamond-analysis.mp4',
  playDuration: 30,
  builtin: true,
  report: { findings: ['ATYPICAL', 'VARIOUS INCLUSIONS', 'NOT PURIFIED', 'DIVERGENT'], grade: 'NEUTRAL', result: 'NEUTRAL', tone: 'neutral' },
}, {
  id: 'diamond-analysis-undetected-preset',
  name: 'Not Detected',
  type: 'video/mp4',
  size: 2645834,
  url: 'diamond-analysis.mp4',
  playDuration: 30,
  builtin: true,
  report: { findings: ['VEILED', 'UNCERTAIN INCLUSIONS', 'NOT PURIFIED', 'AMBIGUOUS'], grade: 'NOT DETECTED', result: 'NOT DETECTED', tone: 'undetected' },
}];

BUILTIN_VIDEOS.forEach((video, index) => { video.code = String(index + 1).padStart(3, '0'); });
['PEARL', 'CORAL', 'RUBY', 'YELLOW SAPPHIRE', 'HESSONITE', 'BLUE SAPPHIRE', 'LEHSUNIA'].forEach((gem, group) => {
  ['NATURAL', 'SYNTHETIC', 'SEMI'].forEach((type, variant) => {
    const template = BUILTIN_VIDEOS[variant];
    const code = `${group + 1}1${variant + 1}`;
    BUILTIN_VIDEOS.push({ ...template, id: `category-${code}`, code, name: `${type} ${gem}`, report: { ...template.report, findings: [...template.report.findings], result: `${type} ${gem}` } });
  });
});
let codeBuffer = '';

function handleControlKey(key) {
  if (key === '9' && !codeBuffer) { showCamera(); return; }
  if (key === 'Enter' && codeBuffer === '0') { codeBuffer = ''; enterBlackout(); return; }
  if (/^[0-9]$/.test(key)) {
    if (codeBuffer.length < 3) codeBuffer += key;
  } else if (key === 'Backspace') codeBuffer = codeBuffer.slice(0, -1);
  else if (key === 'Escape') codeBuffer = '';
  else if (key === 'Enter') {
    const index = codeBuffer.length === 3 ? state.videos.findIndex((video) => video.code === codeBuffer) : -1;
    codeBuffer = '';
    if (index >= 0) playSlot(index);
  } else if (key.toLowerCase() === 'c') { codeBuffer = ''; showCamera(); }
  else if (key.toLowerCase() === 'l') { codeBuffer = ''; enterBlackout(); }
}

const state = { videos: [], activeIndex: null, blackout: false, cameraActive: false, cameraReady: false, cameraStream: null };
const playerElements = [];
let analysisTimer = null;
let processingInterval = null;
let playbackGeneration = 0;
let latestReport = null;
let hasSnapshot = false;
const processingStatus = document.querySelector('#processingStatus');
const processingTime = document.querySelector('#processingTime');
const processingProgress = document.querySelector('#processingProgress');
const stage = document.querySelector('#stage');
const players = document.querySelector('#players');
const slots = document.querySelector('#slots');
const fileInput = document.querySelector('#fileInput');
const emptyStage = document.querySelector('#emptyStage');
const emptyTitle = document.querySelector('#emptyTitle');
const emptyCopy = document.querySelector('#emptyCopy');
const emptyAddButton = document.querySelector('#emptyAddButton');
const addButton = document.querySelector('#addButton');
const notice = document.querySelector('#notice');
const noticeText = document.querySelector('#noticeText');
const cameraPlayer = document.querySelector('#cameraPlayer');
const cameraButton = document.querySelector('#cameraButton');
const cameraButtonText = document.querySelector('#cameraButtonText');
const cameraSnapshot = document.querySelector('#cameraSnapshot');
const snapshotFrame = document.querySelector('#snapshotFrame');
const analysisHeader = document.querySelector('#analysisHeader');
const resultFrame = document.querySelector('#resultFrame');
new ResizeObserver(() => {
  players.style.setProperty('--media-width', `${players.clientWidth}px`);
  players.style.setProperty('--media-height', `${players.clientHeight}px`);
}).observe(players);
const keypadButton = document.querySelector('#keypadButton');
const controlPad = document.querySelector('#controlPad');

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredVideos() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => (a.order || 0) - (b.order || 0)));
    request.onerror = () => reject(request.error);
  });
}

async function persistVideos() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    state.videos.filter((video) => !video.builtin).forEach(({ url, ...video }, order) => store.put({ ...video, order }));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function showNotice(message) {
  noticeText.textContent = message;
  notice.hidden = false;
}

function readableSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes > 99 * 1024 * 1024 ? 0 : 1)} MB`;
}

function requestFullscreen() {
  if (document.fullscreenElement) return;
  const request = stage.requestFullscreen || stage.webkitRequestFullscreen;
  if (request) Promise.resolve(request.call(stage)).catch(() => undefined);
}

function stopPlayers(reset = true) {
  playerElements.forEach((player) => {
    if (!player) return;
    player.pause();
    if (reset) player.currentTime = 0;
  });
}

function resetAnalysisPresentation() {
  playbackGeneration += 1;
  window.clearInterval(processingInterval);
  processingStatus.hidden = true;
  window.clearTimeout(analysisTimer);
  analysisTimer = null;
  stage.classList.remove('analysis-mode', 'preset-analysis');
  analysisHeader.hidden = true;
  resultFrame.hidden = true;
  snapshotFrame.classList.remove('snapshot-active', 'scan-complete');
}

function showAnalysisResult(index, video) {
  if (state.activeIndex !== index || !video.report) return;
  window.clearTimeout(analysisTimer);
  analysisTimer = null;
  window.clearInterval(processingInterval);
  processingStatus.hidden = true;
  const player = playerElements[index];
  player?.pause();
  player?.classList.remove('player-active');
  const report = video.report;
  if (report) {
    resultFrame.dataset.tone = report.tone;
    resultFrame.querySelectorAll('.report-findings li').forEach((item, i) => { item.textContent = report.findings[i]; });
    resultFrame.querySelector('.report-graph > span').textContent = report.grade;
    const graphDescription = { good: 'green bar', bad: 'red bar', neutral: 'equal-height green and red bars', undetected: 'light blue bar' };
    resultFrame.querySelector('.report-bar').setAttribute('aria-label', `${report.grade}: ${graphDescription[report.tone]}`);
    resultFrame.querySelector('.report-verdict h2').textContent = report.result;
  }
  resultFrame.hidden = false;
  snapshotFrame.classList.add('scan-complete');
  latestReport = { ...video.report, completedAt: new Date().toISOString(), id: `DRC6-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, photo: hasSnapshot ? cameraSnapshot.toDataURL('image/jpeg', .9) : null };
}

function enterBlackout() {
  stopPlayers();
  resetAnalysisPresentation();
  state.activeIndex = null;
  state.blackout = true;
  state.cameraActive = false;
  cameraPlayer.classList.remove('camera-active');
  emptyStage.hidden = false;
  playerElements.forEach((player) => player.classList.remove('player-active'));
  requestFullscreen();
  renderSlots();
}

async function captureFreshSnapshot(generation) {
  hasSnapshot = false;
  const context = cameraSnapshot.getContext('2d');
  context?.clearRect(0, 0, cameraSnapshot.width, cameraSnapshot.height);
  const isLive = () => state.cameraStream?.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted);
  if (!context || !isLive()) return;
  try {
    await cameraPlayer.play();
    // Wait for newly delivered frames, never copy the hidden player's cached frame.
    const fresh = await new Promise((resolve) => {
      let frameId;
      let poll;
      let frames = 0;
      const initialTime = cameraPlayer.currentTime;
      const finish = (result) => {
        clearTimeout(timeout);
        clearInterval(poll);
        if (frameId !== undefined) cameraPlayer.cancelVideoFrameCallback(frameId);
        resolve(result);
      };
      const timeout = setTimeout(() => finish(false), 1500);
      if (cameraPlayer.requestVideoFrameCallback) {
        const nextFrame = () => {
          if (++frames >= 2) finish(true);
          else frameId = cameraPlayer.requestVideoFrameCallback(nextFrame);
        };
        frameId = cameraPlayer.requestVideoFrameCallback(nextFrame);
      } else {
        poll = setInterval(() => {
          if (cameraPlayer.currentTime > initialTime && cameraPlayer.readyState >= 2) finish(true);
        }, 30);
      }
    });
    if (generation !== playbackGeneration) return;
    if (!fresh || !isLive() || !cameraPlayer.videoWidth || !cameraPlayer.videoHeight) {
      showNotice('No fresh camera photo available. Press 9 to reconnect the camera.');
      return;
    }
    cameraSnapshot.width = cameraPlayer.videoWidth;
    cameraSnapshot.height = cameraPlayer.videoHeight;
    context.drawImage(cameraPlayer, 0, 0, cameraSnapshot.width, cameraSnapshot.height);
    hasSnapshot = true;
  } catch {
    if (generation === playbackGeneration) showNotice('Camera photo unavailable. Press 9 to reconnect the camera.');
  }
}

function playSlot(index) {
  const video = state.videos[index];
  if (!video) return;
  let player = playerElements[index];
  if (!player) { player = createPlayer(video, index); players.append(player); }
  codeBuffer = '';
  controlPad.hidden = true;
  resetAnalysisPresentation();
  requestFullscreen();
  captureFreshSnapshot(playbackGeneration);
  playerElements.forEach((item, itemIndex) => {
    if (itemIndex !== index && item) {
      item.pause();
      item.currentTime = 0;
      item.classList.remove('player-active');
    }
  });
  state.blackout = false;
  state.cameraActive = false;
  state.activeIndex = index;
  emptyStage.hidden = true;
  cameraPlayer.classList.remove('camera-active');
  stage.classList.add('analysis-mode');
  stage.classList.toggle('preset-analysis', Boolean(video.builtin));
  analysisHeader.hidden = false;
  snapshotFrame.classList.add('snapshot-active');
  player.classList.add('player-active');
  player.currentTime = 0;
  const generation = playbackGeneration;
  player.play().then(() => {
    if (generation !== playbackGeneration) return;
    if (video.report && video.playDuration) {
      const started = performance.now();
      processingStatus.hidden = false;
      processingTime.textContent = `${video.playDuration} sec`;
      processingProgress.max = video.playDuration;
      processingProgress.value = 0;
      processingInterval = window.setInterval(() => {
        const elapsed = (performance.now() - started) / 1000;
        processingTime.textContent = `${Math.max(0, Math.ceil(video.playDuration - elapsed))} sec`;
        processingProgress.value = Math.min(video.playDuration, elapsed);
      }, 100);
      analysisTimer = window.setTimeout(() => showAnalysisResult(index, video), video.playDuration * 1000);
    }
  }).catch(() => showNotice('Playback was blocked. Press the number key again.'));
  renderSlots();
}

async function showCamera() {
  requestFullscreen();
  stopPlayers();
  resetAnalysisPresentation();
  state.activeIndex = null;
  state.blackout = false;
  emptyStage.hidden = true;
  playerElements.forEach((player) => player.classList.remove('player-active'));

  try {
    if (!state.cameraStream || !state.cameraStream.active) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showNotice('Live camera is not supported by this browser.');
        return;
      }
      cameraButton.disabled = true;
      cameraButtonText.textContent = 'Starting...';
      state.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      cameraPlayer.srcObject = state.cameraStream;
      state.cameraReady = true;
      cameraButton.classList.add('ready');
      cameraButtonText.textContent = 'Live camera';
    }
    state.cameraActive = true;
    cameraPlayer.classList.add('camera-active');
    await cameraPlayer.play();
  } catch (error) {
    cameraButtonText.textContent = state.cameraReady ? 'Live camera' : 'Enable camera';
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      showNotice('Camera permission was not allowed. Enable it in the browser and press 9 again.');
    } else {
      showNotice('The camera could not be started on this device.');
    }
  } finally {
    cameraButton.disabled = false;
  }
}

function createPlayer(video, index) {
  const player = document.createElement('video');
  player.src = video.url;
  player.preload = 'auto';
  player.playsInline = true;
  player.disablePictureInPicture = true;
  player.controls = false;
  player.className = 'player';
  player.loop = Boolean(video.report && video.playDuration);
  player.setAttribute('controlslist', 'nodownload noplaybackrate nofullscreen');
  player.addEventListener('ended', () => enterBlackout());
  player.addEventListener('error', () => showNotice('This browser cannot play that video format.'));
  playerElements[index] = player;
  return player;
}

function renderPlayers() {
  stopPlayers();
  players.replaceChildren();
  playerElements.length = 0;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderSlots() {
  slots.replaceChildren();
  document.querySelector('#videoCount').textContent = `${state.videos.length} / ${MAX_VIDEOS}`;
  addButton.disabled = state.videos.length >= MAX_VIDEOS;
  emptyTitle.textContent = state.videos.length ? 'Choose a video slot' : 'Load your first set';
  emptyCopy.textContent = state.videos.length ? 'Your videos are ready below.' : 'Select up to eight videos from this device.';
  emptyAddButton.hidden = state.videos.length > 0;

  for (let index = 0; index < state.videos.length; index += 1) {
    const video = state.videos[index];
    if (!video) {
      const empty = makeElement('button', 'slot-card empty');
      empty.append(makeElement('span', 'slot-number', String(index + 1)), makeElement('span', 'empty-slot-plus', '+'), makeElement('span', '', 'Empty slot'));
      empty.addEventListener('click', () => fileInput.click());
      slots.append(empty);
      continue;
    }

    const card = makeElement('article', `slot-card${state.activeIndex === index ? ' active' : ''}`);
    const playButton = makeElement('button', 'slot-play');
    playButton.setAttribute('aria-label', `Play ${video.name}`);
    const preview = makeElement('span', 'slot-preview');
    preview.append(makeElement('span', 'play-glyph', '▶'));
    const copy = makeElement('span', 'slot-copy');
    copy.append(makeElement('strong', '', video.name), makeElement('small', '', video.builtin ? '30 SEC ANALYSIS' : readableSize(video.size)));
    playButton.append(makeElement('span', 'slot-number', video.code), preview, copy);
    playButton.addEventListener('click', () => playSlot(index));

    card.append(playButton);
    if (!video.builtin) {
      const removeButton = makeElement('button', 'remove-button', '×');
      removeButton.title = 'Remove video';
      removeButton.setAttribute('aria-label', `Remove ${video.name}`);
      removeButton.addEventListener('click', () => removeVideo(index));
      card.append(removeButton);
    }
    slots.append(card);
  }
}

async function addVideos(files) {
  const videoFiles = Array.from(files).filter((file) => file.type.startsWith('video/'));
  if (!videoFiles.length) return;
  const space = MAX_VIDEOS - state.videos.length;
  const accepted = videoFiles.slice(0, space);
  const storedCount = state.videos.filter((video) => !video.builtin).length;
  const additions = accepted.map((file, index) => ({
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^/.]+$/, ''),
    type: file.type,
    size: file.size,
    blob: file,
    order: storedCount + index,
    code: String(801 + storedCount + index),
    url: URL.createObjectURL(file),
  }));
  state.videos.push(...additions);
  renderPlayers();
  renderSlots();
  try {
    await persistVideos();
    showNotice(`${additions.length} video${additions.length === 1 ? '' : 's'} saved on this device.`);
  } catch {
    showNotice('These videos are too large for browser storage, but they will work until this tab closes.');
  }
  if (videoFiles.length > space) showNotice(`Only ${space} more video${space === 1 ? '' : 's'} can be added.`);
}

async function removeVideo(index) {
  if (state.videos[index]?.builtin) return;
  const [removed] = state.videos.splice(index, 1);
  URL.revokeObjectURL(removed.url);
  state.activeIndex = null;
  state.blackout = false;
  stopPlayers();
  renderPlayers();
  renderSlots();
  emptyStage.hidden = false;
  try { await persistVideos(); } catch { showNotice('Could not update local storage.'); }
}

fileInput.addEventListener('change', async () => {
  await addVideos(fileInput.files);
  fileInput.value = '';
});
addButton.addEventListener('click', () => fileInput.click());
emptyAddButton.addEventListener('click', () => fileInput.click());
document.querySelector('#blackoutButton').addEventListener('click', enterBlackout);
cameraButton.addEventListener('click', showCamera);
keypadButton.addEventListener('click', () => {
  controlPad.hidden = !controlPad.hidden;
  keypadButton.classList.toggle('active', !controlPad.hidden);
  keypadButton.setAttribute('aria-pressed', String(!controlPad.hidden));
});
controlPad.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-key]');
  if (!button || button.disabled) return;
  const key = button.dataset.key;
  handleControlKey(key);
});
notice.addEventListener('click', () => { notice.hidden = true; });

window.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea, select, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (/^[0-9cClL]$/.test(event.key) || ['Enter', 'Backspace', 'Escape'].includes(event.key)) {
    event.preventDefault();
    handleControlKey(event.key);
  }
});

document.querySelector('#previewReport').addEventListener('click', () => {
  if (!latestReport) return;
  try {
    sessionStorage.setItem('diamond-report-preview', JSON.stringify(latestReport));
    document.querySelector('#reportEmbed').src = 'report.html';
    document.querySelector('#reportDialog').showModal();
  } catch {
    showNotice('Unable to open the report. Please allow browser storage for this site.');
  }
});

document.querySelector('#closeReport').addEventListener('click', () => document.querySelector('#reportDialog').close());

(async function initialize() {
  let stored = [];
  try {
    stored = await readStoredVideos();
  } catch {
    showNotice('Local storage is unavailable. Videos will last until this tab closes.');
  }
  state.videos = [
    ...BUILTIN_VIDEOS,
    ...stored.slice(0, MAX_VIDEOS - BUILTIN_VIDEOS.length).map((video, index) => ({ ...video, code: String(801 + index), url: URL.createObjectURL(video.blob) })),
  ];
  renderPlayers();
  renderSlots();
})();

window.addEventListener('beforeunload', () => {
  state.videos.filter((video) => !video.builtin).forEach((video) => URL.revokeObjectURL(video.url));
  window.clearTimeout(analysisTimer);
  state.cameraStream?.getTracks().forEach((track) => track.stop());
});
