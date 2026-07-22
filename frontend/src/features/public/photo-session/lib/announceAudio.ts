import { resolveRobotUrl } from '@/lib/api-client';
import { playBackendAudioForce } from '@/lib/audio';

/**
 * Lama hold deteksi per narasi (detik) = panjang file audio + margin skew
 * poll/network. Diukur dari file: unlock.mp3 ±3.0s, inisiasi.mp3 ±2.4s.
 * Kalau file audionya diganti, sesuaikan angka di sini.
 */
const ANNOUNCE_HOLD_SEC: Record<string, number> = {
  'inisiasi.mp3': 2.8,
  'unlock.mp3': 3.5,
};

/**
 * Putar narasi instruksional SEKALIGUS minta robot menahan pengenalan gesture
 * selama narasi berbunyi — supaya user menyimak dulu dan gesturenya tidak keburu
 * terhitung.
 *
 * Dipakai untuk SETIAP putaran (termasuk loop inisiasi ke-2/ke-3): jadwal loop
 * hanya diketahui frontend, jadi robot tak bisa menebaknya sendiri — makanya
 * diberitahu eksplisit lewat POST /detection/hold.
 *
 * Sengaja TIDAK dipakai untuk cue yang berbunyi SAAT gesture sedang dikenali
 * (mis. tahan.mp3 / presetTerkonfirmasi.mp3) — menahan deteksi di situ justru
 * bikin counter kereset terus sehingga preset tak pernah terkonfirmasi.
 */
export function playAnnounce(filename: string): void {
  // Instruksi (inisiasi/unlock) OUTRANK peringatan "waktu hampir habis": pakai
  // force supaya SELALU berbunyi & menembus narasi prioritas kalau kebetulan
  // sedang diputar. Peringatan yang tertembus lalu arm-ulang sendiri (lewat
  // onInterrupted-nya) dan menyusul di celah bersih berikutnya. Jadi instruksi
  // tak pernah ke-skip — user selalu dengar "unlock" dulu, peringatan belakangan.
  // Karena force selalu benar-benar memutar, hold deteksi juga selalu dikirim.
  playBackendAudioForce(filename);

  const seconds = ANNOUNCE_HOLD_SEC[filename];
  if (!seconds) return;

  // Fire-and-forget: kalau POST gagal, robot masih punya jaring pengaman berupa
  // window sejak transisi state (locked/unlock announce), jadi cukup diabaikan.
  fetch(`${resolveRobotUrl()}/detection/hold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seconds }),
  }).catch(() => {});
}
