let streamRetries = 0;
let streamTimer = null;
let currentFsmState = 'LOCKED';
let sessionActive = false;
let activeNumberedPreset = null; 
let previousPreset = null;  

// ═══ Session Gate ═══
function applySessionState(active, statusText) {
  sessionActive = !!active;
  const gate = document.getElementById('sessionGate');
  if (gate) gate.classList.toggle('hidden', sessionActive);
  const txt = document.getElementById('sessionStatusText');
  if (txt && statusText) txt.textContent = statusText;
}

// ═══ Webcam stream ═══
function streamOk() {
  streamRetries = 0;
  document.getElementById('vidOverlay')?.classList.add('hidden');
  if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
}
function streamErr() {
  document.getElementById('vidOverlay')?.classList.remove('hidden');
  streamRetries++;
  streamTimer = setTimeout(() => {
    const img = document.getElementById('streamImg');
    if (img) img.src = '/video_feed?' + Date.now();
  }, Math.min(1000 * streamRetries, 5000));
}

// ═══ State Machine ═══
const SM_MAP = {
  'LOCKED':     'smIdle',
  'UNLOCKING':  'smIdle',
  'UNLOCKED':   'smReady',
  'CONFIRMING': 'smReady',
  'MOVING':     'smMoving',
  'COOLDOWN':   'smCapture',
};
const SM_OVERLAY = { 'MOVING': 'Moving to position…' };

function updateSM(state) {
  if (state === currentFsmState) return;
  currentFsmState = state;

  document.querySelectorAll('.sm-step').forEach(e => e.classList.remove('active'));
  const id = SM_MAP[state];
  if (id) document.getElementById(id)?.classList.add('active');

  const ov  = document.getElementById('stateOverlay');
  const txt = SM_OVERLAY[state];
  if (txt) {
    const lbl = document.getElementById('stateOverlayLabel');
    if (lbl) lbl.textContent = txt;
    ov?.classList.remove('hidden');
  } else {
    ov?.classList.add('hidden');
  }
}

// ═══ Progress bars ═══
function renderRecognitionProgress(progress, fsmState) {
  const clampPercent = value => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, Math.round(num)));
  };

  const armPercent    = clampPercent(progress && progress.arm && progress.arm.percent);
  const presetPercent = clampPercent(progress && progress.preset && progress.preset.percent);

  const readyForArm    = fsmState === 'LOCKED' || fsmState === 'UNLOCKING';
  const readyForPreset = fsmState === 'UNLOCKED' || fsmState === 'CONFIRMING';
  const armDone        = ['UNLOCKED', 'CONFIRMING', 'MOVING', 'COOLDOWN'].includes(fsmState);
  const presetDone     = ['MOVING', 'COOLDOWN'].includes(fsmState);

  const stateFrom = (ready, done, percent) => {
    if (done) return 'done';
    if (ready) return percent > 0 ? 'pending' : 'ready';
    return 'idle';
  };

  const armState    = stateFrom(readyForArm, armDone, armPercent);
  const presetState = stateFrom(readyForPreset, presetDone, presetPercent);

  const stateColor = s => {
    if (s === 'ready')   return '#3F72AF';
    if (s === 'done')    return '#00c896';
    if (s === 'pending') return '#f5a623';
    return 'rgba(249, 247, 247, 0.5)';
  };
  const fillGradient = s => (s === 'idle' ? 'rgba(249, 247, 247, 0.35)' : '#F9F7F7');

  const armName    = armDone    ? 'Safety Unlock (UNLOCKED)' : (armPercent >= 100 ? 'Safety Unlock (READY)' : 'Safety Unlock');
  const presetName = presetDone ? 'Pose Preset (RECOGNIZED)'  : (readyForPreset ? 'Pose Preset (READY)' : 'Pose Preset');

  const applyStage = (nameId, fillId, valueId, name, percent, st) => {
    const nameEl  = document.getElementById(nameId);
    const fillEl  = document.getElementById(fillId);
    const valueEl = document.getElementById(valueId);
    if (!nameEl || !fillEl || !valueEl) return;
    nameEl.textContent  = name;
    nameEl.style.color  = stateColor(st);
    fillEl.style.width  = percent + '%';
    fillEl.style.background = fillGradient(st);
    valueEl.textContent = percent + '%';
    valueEl.style.color = stateColor(st);
  };

  applyStage('camArmStageName',    'camArmProgFill',    'camArmProg',    armName,    armPercent,    armState);
  applyStage('camPresetStageName', 'camPresetProgFill', 'camPresetProg', presetName, presetPercent, presetState);
}

// ═══ Poll Detection ═══
function poll() {
  fetch('/detection').then(r => r.json()).then(d => {
    const robotConnected = d.robot && d.robot.connected;
    const gateText = robotConnected
      ? 'Waiting for activation…'
      : 'Robot offline — control panel unreachable';
    applySessionState(d.session_active, gateText);

    const hand = d.hand_detected;

    const gNumEl  = document.getElementById('gNum');
    const gNameEl = document.getElementById('gName');
    const gConfEl = document.getElementById('gConf');
    const gMethEl = document.getElementById('gMethod');
    if (gNumEl)  { gNumEl.textContent = hand ? d.gesture_id : '—'; gNumEl.classList.toggle('cyan', !!hand); }
    if (gNameEl) gNameEl.textContent  = hand ? d.gesture_name : 'Waiting';
    if (gConfEl) gConfEl.textContent  = hand ? Math.round((d.confidence || 0) * 100) + '%' : '—';
    if (gMethEl) gMethEl.textContent  = d.method || '—';

    const fsm = d.fsm_state || 'LOCKED';

    const cp = document.getElementById('camProgress');
    if (cp) cp.classList.toggle('paused', ['MOVING', 'COOLDOWN'].includes(fsm));

    renderRecognitionProgress(d.recognition_progress, fsm);

    const preset = d.robot_preset;
    let pLabel = '—', pSub = 'No preset selected';
    if (preset === 'scan') { pLabel = 'SCAN'; pSub = 'Oscillating'; }
    else if (preset)       { pLabel = 'Preset ' + preset; pSub = 'Moving to pose'; }
    const gPresetEl     = document.getElementById('gPreset');
    const gPresetNameEl = document.getElementById('gPresetName');
    if (gPresetEl)     gPresetEl.textContent     = pLabel;
    if (gPresetNameEl) gPresetNameEl.textContent = pSub;

    const isNumberedPreset = preset && preset !== 'scan';
    if (isNumberedPreset) {
      activeNumberedPreset = preset;
    } else if (activeNumberedPreset !== null) {
      previousPreset = activeNumberedPreset;
      activeNumberedPreset = null;
    }
    const gPrevEl     = document.getElementById('gPrevPreset');
    const gPrevNameEl = document.getElementById('gPrevPresetName');
    if (gPrevEl)     gPrevEl.textContent     = previousPreset ? 'Preset ' + previousPreset : '—';
    if (gPrevNameEl) gPrevNameEl.textContent = previousPreset ? 'Last completed pose' : 'No history yet';

    const sb = document.getElementById('scanBar');
    if (sb) {
      if (d.scan_active) {
        sb.classList.add('active');
        const sp = document.getElementById('scanPos');
        if (sp) sp.textContent = d.scan_position === 'pos2' ? 'Position 2' : 'Position 1';
      } else {
        sb.classList.remove('active');
      }
    }

    updateSM(fsm);
  }).catch(() => {});
}

// ═══ Start ═══
setInterval(poll, 150);
