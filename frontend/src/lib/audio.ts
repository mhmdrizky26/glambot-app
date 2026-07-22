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
  'mulaiNew.mp3',
  'selamatDatang.mp3',
  'pilihJumlahCetak.mp3',
  'pembayaranDiproses.mp3',
  'pembayaranBerhasil.mp3',
  'pembayaranGagal.mp3',
  'intro.mp3',
  'keselamatan.mp3',
  'presetSlow.mp3',
  'inisiasi.mp3',
  'presetTerkonfirmasi.mp3',
  'tahan.mp3',
  'unlock.mp3',
  'satu.mp3',
  'dua.mp3',
  'tiga.mp3',
  'pilihFoto.mp3',
  'prosesFoto.mp3',
  'scanQrAmbilFoto.mp3',
  'terimaKasih.mp3',
  // Peringatan waktu menipis: waktuHabis = editor foto (15 dtk terakhir),
  // waktuHabisFoto = sesi foto (20 dtk terakhir).
  'waktuHabis.mp3',
  'waktuHabisFoto.mp3',
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
 * ─── Narasi PRIORITAS ───────────────────────────────────────────────────────
 * Sebagian narasi wajib terdengar utuh (mis. "waktu foto hampir habis") dan
 * tidak boleh dipotong cue real-time yang berdatangan — unlock gesture,
 * inisiasi, preset terkonfirmasi, dsb. Selama clip prioritas berbunyi,
 * `playBackendAudio` biasa akan DILEWATI (bukan diantrikan: cue robot bersifat
 * real-time, memutarnya terlambat malah menyesatkan).
 *
 * Satu-satunya yang boleh menembus adalah `playBackendAudioForce` — dipakai
 * countdown auto-capture, karena aba-aba jepret lebih penting daripada
 * peringatan waktu. Saat itu terjadi, `onInterrupted` milik clip prioritas
 * dipanggil supaya pemanggilnya bisa menjadwalkan ulang.
 */
let priorityVoice: HTMLAudioElement | null = null;
let priorityInterrupted: (() => void) | null = null;

const clearPriority = () => {
  priorityVoice = null;
  priorityInterrupted = null;
};

/**
 * Apakah ada narasi prioritas yang sedang dilindungi?
 *
 * Sengaja dari latch `priorityVoice`, BUKAN dari `audio.paused` — `play()`
 * bersifat asinkron, jadi tepat setelah dimulai clip masih berstatus paused
 * dan cue yang datang di jeda itu akan lolos menyela. Latch dilepas saat clip
 * selesai (termasuk pengaman timeout di playAudioElement), ditembus force,
 * atau saat stopBackendAudio.
 */
export function isPriorityAudioPlaying(): boolean {
  return priorityVoice !== null;
}

/**
 * Apakah ADA narasi apa pun yang sedang berbunyi di channel? Dipakai pemanggil
 * yang ingin menyelipkan narasi "boleh mengalah" (mis. peringatan waktu) HANYA
 * saat channel senyap — supaya tidak memotong instruksi (unlock/inisiasi) yang
 * sedang diputar. Beda dari isPriorityAudioPlaying: ini melihat suara aktual.
 */
export function isVoiceBusy(): boolean {
  return !!currentVoice && !currentVoice.paused && !currentVoice.ended;
}

/**
 * Play an audio file served from backend `/storage/audio/`.
 * Caches the Audio element across calls so repeated plays don't re-fetch.
 * Silently fails on autoplay block / missing file.
 *
 * `onEnded` (opsional) dipanggil saat clip selesai — juga saat play() gagal atau
 * event 'ended' tak fire (pengaman timeout), supaya pemanggil tak menunggu selamanya.
 *
 * Return `false` kalau cue DILEWATI karena ada narasi prioritas yang sedang
 * dilindungi. Pemanggil yang punya efek samping selain suara WAJIB mengecek ini
 * — mis. playAnnounce yang ikut membekukan deteksi gesture di robot: membekukan
 * deteksi padahal narasinya tidak jadi berbunyi membuat gesture user berhenti
 * terbaca tanpa penjelasan apa pun.
 */
export function playBackendAudio(
  filename: string,
  onEnded?: () => void,
): boolean {
  if (typeof window === 'undefined') return false;
  const audio = getAudio(filename);

  // Ada narasi prioritas berbunyi → jangan potong; lewati cue ini. onEnded
  // tetap dipanggil supaya pemanggil yang memakainya sebagai gate tidak hang.
  if (audio !== priorityVoice && isPriorityAudioPlaying()) {
    onEnded?.();
    return false;
  }

  playAudioElement(audio, onEnded);
  return true;
}

/**
 * Putar narasi PRIORITAS — tidak boleh dipotong `playBackendAudio` biasa.
 * `onInterrupted` dipanggil kalau clip ini ditembus `playBackendAudioForce`
 * (countdown auto-capture), supaya pemanggil bisa memutarnya ulang nanti.
 */
export function playBackendAudioPriority(
  filename: string,
  opts?: { onEnded?: () => void; onInterrupted?: () => void },
): void {
  if (typeof window === 'undefined') return;
  const audio = getAudio(filename);
  priorityVoice = audio;
  priorityInterrupted = opts?.onInterrupted ?? null;

  playAudioElement(audio, () => {
    if (priorityVoice === audio) clearPriority();
    opts?.onEnded?.();
  });
}

/**
 * Putar narasi yang BOLEH menembus narasi prioritas. Khusus untuk aba-aba yang
 * lebih penting dari peringatan apa pun — countdown auto-capture & konfirmasi
 * preset (rangkaian jepret foto).
 */
export function playBackendAudioForce(
  filename: string,
  onEnded?: () => void,
): void {
  if (typeof window === 'undefined') return;

  // Beri tahu clip prioritas bahwa ia terpotong, lalu lepas proteksinya.
  if (isPriorityAudioPlaying() && getAudio(filename) !== priorityVoice) {
    const notify = priorityInterrupted;
    clearPriority();
    notify?.();
  } else {
    clearPriority();
  }

  playAudioElement(getAudio(filename), onEnded);
}

/** Mesin pemutar bersama — dipakai ketiga varian di atas. */
function playAudioElement(
  audio: HTMLAudioElement,
  onEnded?: () => void,
): void {
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
  // Lepas proteksi juga — kalau tidak, clip prioritas yang baru saja dihentikan
  // akan terus memblokir semua narasi di halaman berikutnya.
  clearPriority();
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
