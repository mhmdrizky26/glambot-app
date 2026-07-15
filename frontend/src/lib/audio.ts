import { resolveBaseUrl } from '@/lib/api-client';

const audioCache = new Map<string, HTMLAudioElement>();

// Clip narasi yang sedang berbunyi — dipakai untuk menunggu satu narasi selesai
// sebelum memutar yang berikutnya (satu "channel" suara).
let currentVoice: HTMLAudioElement | null = null;

function getAudio(filename: string): HTMLAudioElement {
  let audio = audioCache.get(filename);
  if (!audio) {
    audio = new Audio(`${resolveBaseUrl()}/storage/audio/${filename}`);
    audio.preload = 'auto';
    audioCache.set(filename, audio);
  }
  return audio;
}

// Semua narasi yang dipreload sekali di awal supaya play pertama tanpa jeda.
export const BACKEND_AUDIO_FILES = [
  'selamatDatang.mp3',
  'pilihJumlahCetak.mp3',
  'pembayaranDiproses.mp3',
  'pembayaranBerhasil.mp3',
  'pembayaranGagal.mp3',
  'intro.mp3',
  'keselamatan.mp3',
  'preset.mp3',
  'inisiasi.mp3',
  'presetTerkonfirmasi.mp3',
  'GestureTerdeteksi.mp3',
  'unlock.mp3',
  'satu.mp3',
  'dua.mp3',
  'tiga.mp3',
  'pilihFoto.mp3',
  'prosesFoto.mp3',
  'scanQrAmbilFoto.mp3',
  'terimaKasih.mp3',
];

/**
 * Preload (download + buffer) audio ke cache tanpa memutarnya. Aman dipanggil
 * sebelum interaksi user — tidak kena autoplay block.
 */
export function preloadBackendAudio(
  filenames: string[] = BACKEND_AUDIO_FILES,
): void {
  if (typeof window === 'undefined') return;
  for (const filename of filenames) {
    const audio = getAudio(filename);
    try {
      audio.load();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Play an audio file served from backend `/storage/audio/`.
 * Caches the Audio element across calls so repeated plays don't re-fetch.
 * Silently fails on autoplay block / missing file.
 *
 * `onEnded` (opsional) dipanggil saat clip selesai — juga saat play() gagal atau
 * event 'ended' tak fire (pengaman timeout), supaya pemanggil tak menunggu selamanya.
 */
export function playBackendAudio(filename: string, onEnded?: () => void): void {
  if (typeof window === 'undefined') return;
  const audio = getAudio(filename);

  // Satu channel narasi: hentikan voice yang sedang berbunyi (kalau beda clip)
  // supaya dua narasi tidak menumpuk. "Terbaru menang" — cocok untuk cue
  // real-time robot yang statenya berganti cepat. Clip yang sama cukup di-rewind.
  if (currentVoice && currentVoice !== audio && !currentVoice.paused) {
    try {
      currentVoice.pause();
      currentVoice.currentTime = 0;
    } catch {
      /* ignore */
    }
  }

  try {
    audio.currentTime = 0;
  } catch {
    /* ignore */
  }
  currentVoice = audio;

  if (onEnded) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.removeEventListener('ended', finish);
      onEnded();
    };
    audio.addEventListener('ended', finish, { once: true });
    // Pengaman kalau 'ended' tak fire: pakai durasi clip + margin, fallback 8s.
    const fallbackMs =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration * 1000 + 500
        : 8000;
    window.setTimeout(finish, fallbackMs);
    audio.play().catch(finish);
    return;
  }

  audio.play().catch(() => {
    /* autoplay blocked or load error — silent */
  });
}

/**
 * Hentikan SEMUA audio narasi/cue yang sedang berbunyi dan reset ke awal.
 * Dipakai saat sesi foto berakhir supaya tidak ada suara sesi (inisiasi, cue
 * gesture, countdown, dll.) yang menyambung ke layar loading / halaman berikut.
 * Menyapu seluruh cache (bukan hanya `currentVoice`) agar clip apa pun yang
 * mungkin masih diputar ikut berhenti.
 */
export function stopBackendAudio(): void {
  if (typeof window === 'undefined') return;
  for (const audio of audioCache.values()) {
    try {
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    } catch {
      /* ignore */
    }
  }
  currentVoice = null;
}

/**
 * Jalankan `cb` saat narasi yang sedang berbunyi selesai (atau langsung kalau
 * senyap); return fungsi cleanup untuk membatalkan (mis. saat unmount).
 *
 * Lintas halaman: `currentVoice` bertahan saat navigasi SPA, jadi mis. halaman
 * package bisa menunggu "selamatDatang" (dimulai di Home) selesai sebelum kartu
 * boleh diklik. Ada pengaman timeout kalau 'ended' tak fire.
 */
export function whenVoiceIdle(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const v = currentVoice;
  if (!v || v.paused || v.ended) {
    cb();
    return () => {};
  }

  let done = false;
  let timer = 0;
  const finish = () => {
    if (done) return;
    done = true;
    v.removeEventListener('ended', finish);
    window.clearTimeout(timer);
    cb();
  };

  v.addEventListener('ended', finish, { once: true });
  const remainingMs =
    Number.isFinite(v.duration) && v.duration > 0
      ? Math.max(0, (v.duration - v.currentTime) * 1000) + 500
      : 8000;
  timer = window.setTimeout(finish, remainingMs);

  return () => {
    if (done) return;
    done = true;
    v.removeEventListener('ended', finish);
    window.clearTimeout(timer);
  };
}

/**
 * Play SETELAH narasi yang sedang berbunyi selesai (atau langsung kalau senyap).
 * Mencegah dua narasi bertabrakan lintas halaman, tanpa menebak durasi audio.
 */
export function playBackendAudioAfterCurrent(
  filename: string,
  onEnded?: () => void,
): void {
  if (typeof window === 'undefined') return;

  const prev = currentVoice;
  const next = getAudio(filename);

  // Tidak ada yang berbunyi (atau clip yang sama) → langsung mainkan.
  if (!prev || prev === next || prev.paused || prev.ended) {
    playBackendAudio(filename, onEnded);
    return;
  }

  let played = false;
  const start = () => {
    if (played) return;
    played = true;
    prev.removeEventListener('ended', start);
    playBackendAudio(filename, onEnded);
  };

  prev.addEventListener('ended', start, { once: true });

  // Pengaman kalau 'ended' tak fire: tetap mainkan setelah durasi wajar.
  const remainingMs =
    Number.isFinite(prev.duration) && prev.duration > 0
      ? Math.max(0, (prev.duration - prev.currentTime) * 1000) + 300
      : 6000;
  window.setTimeout(start, remainingMs);
}
