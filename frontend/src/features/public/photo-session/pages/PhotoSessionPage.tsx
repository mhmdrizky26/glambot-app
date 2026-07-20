'use client';

import { SessionHeader } from '../components/SessionHeader';
import { CameraPreview } from '../components/CameraPreview';
import EndSessionButton from '../components/EndSessionButton';
import { GestureDetectionPanel } from '../components/GestureDetectionPanel';
import { StatusAnimation } from '@/components/shared/StatusAnimation';
import { instructionSteps } from '@/features/public/instruction/data/steps';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useGetSession } from '@/shared/api/session';
import { sendSessionBroadcast } from '../lib/broadcastChannel';
import { useLiveStream } from '../api/getLivePreview';
import { useRobotConfig } from '../api/getRobotConfig';
import { useRobotDetection } from '../api/getRobotDetection';
import { apiClient } from '@/lib/api-client';
import { playBackendAudio, stopBackendAudio } from '@/lib/audio';
import { usePersistedCountdown } from '@/lib/usePersistedCountdown';
import { cn } from '@/lib/utils';

// Hard cap untuk grace period setelah timer 0: kalau robot stuck atau webhook
// /done tidak fire, paksa end sesi setelah ini supaya kiosk tidak hang.
const MAX_GRACE_SEC = 30;

// Daftar gesture preset 1–10 — pakai sumber yang SAMA dengan halaman Instruction
// supaya nomor preset konsisten di kedua halaman (dan urutannya cocok dengan
// layout kartu pada desain).
const PRESET_GESTURES =
  instructionSteps.find((s) => s.type === 'gesture-controls')?.gestures ?? [];

// Frame ala layar Preview Camera (lihat CameraPreview): ring tebal primary +
// offset + shadow biru. Dipakai agar 2 card kanan (Gesture Detection & Gesture
// Controls) tampil senada dengan preview.
const PREVIEW_FRAME =
  'rounded-[28px] border-0 ring-[6px] ring-primary ring-offset-2 ring-offset-transparent shadow-[0_20px_60px_-15px_rgba(63,114,175,0.45)]';

export function PhotoSessionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) router.replace('/package');
  }, [sessionId, router]);

  // Play inisiasi.mp3 sekali saat halaman foto terbuka
  useEffect(() => {
    if (sessionId) playBackendAudio('inisiasi.mp3');
  }, [sessionId]);

  const { data: session, isFetching: isSessionFetching } = useGetSession({
    sessionId,
    queryConfig: { enabled: !!sessionId },
  });

  // Enable robot TEPAT saat masuk sesi foto (halaman kamera tampil). Fire
  // sekali; gate pada sesi valid agar sesi pending/expired yang akan di-redirect
  // tidak ikut menyalakan robot. Disable-nya ada di end-effect di bawah, jadi
  // enable↔disable seimbang dan dimiliki oleh halaman yang sama.
  const enableFiredRef = useRef(false);
  // Dipakai bersama end-effect & cleanup unmount agar disable robot hanya
  // dikirim SEKALI (tidak dobel) dan tidak terlewat.
  const robotDisabledRef = useRef(false);
  useEffect(() => {
    if (!sessionId || isSessionFetching || !session) return;
    if (session.status === 'pending_payment' || session.status === 'expired')
      return;
    if (enableFiredRef.current) return;
    enableFiredRef.current = true;

    apiClient.post('/api/robot/enable').catch((err) => {
      console.warn('[PhotoSession] robot/enable failed:', err);
    });
  }, [sessionId, session, isSessionFetching]);

  // Safety-net: kalau halaman ditinggalkan lewat jalur SELAIN end-flow normal
  // (tombol back browser, redirect eksternal), pastikan robot tetap dimatikan
  // saat unmount. Guard robotDisabledRef mencegah dobel dengan disable di
  // end-effect. Fire hanya bila robot memang sempat di-enable.
  useEffect(() => {
    return () => {
      if (enableFiredRef.current && !robotDisabledRef.current) {
        robotDisabledRef.current = true;
        apiClient.post('/api/robot/disable').catch(() => {});
      }
    };
  }, []);

  // Guard: sesi belum dibayar / kedaluwarsa di-redirect. Tunggu data FRESH
  // (jangan react saat fetching) agar cache 'pending_payment' basi tidak salah redirect.
  useEffect(() => {
    if (isSessionFetching) return;
    if (session?.status === 'pending_payment' || session?.status === 'expired') {
      router.replace('/package');
    }
  }, [session?.status, isSessionFetching, router]);

  // Timer durasi sesi dari package — kalau halaman di-refresh sisa waktu
  // dihitung dari awal sesi (bukan reset). Key null saat session belum load
  // agar storage tidak ditulis dengan durasi fallback yang salah.
  const sessionDuration = session?.durationSecs;
  const { timeLeft: sessionTimeLeft, clear: clearSessionTimer } =
    usePersistedCountdown(
      sessionId && sessionDuration != null ? `photo-session:${sessionId}` : null,
      sessionDuration ?? 300,
    );
  // Pastikan blok "session end" (broadcast + disable robot + navigate) cuma
  // fire SEKALI walaupun effect re-run akibat dep `session` (dari useGetSession)
  // refresh/refetch saat sessionTimeLeft sudah 0.
  const endFiredRef = useRef(false);
  const endTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (endTimeoutRef.current) clearTimeout(endTimeoutRef.current);
    };
  }, []);

  const {
    frameUrl,
    hasError,
    errorMessage,
    handleStreamError,
    retryStream,
  } = useLiveStream();

  // State real-time dari dobot (Flask :5001) untuk panel Gesture Detection:
  // liveview kamera deteksi tangan + fsm lock/unlock + progress. Poll selama
  // halaman sesi foto terbuka (sesi valid). Beda dari `frameUrl` di atas yang
  // adalah preview kamera backend — panel gesture butuh stream dobot sendiri.
  const {
    detection: robotDetection,
    reachable: robotReachable,
    streamUrl: robotStreamUrl,
  } = useRobotDetection({ enabled: !!sessionId });

  const robotFsmState = robotDetection?.fsm_state ?? 'LOCKED';
  const robotArmPercent =
    robotDetection?.recognition_progress?.arm?.percent ?? 0;
  const robotPresetPercent =
    robotDetection?.recognition_progress?.preset?.percent ?? 0;
  const robotHandDetected = !!robotDetection?.hand_detected;
  const robotGestureName = robotHandDetected
    ? robotDetection?.gesture_name ?? null
    : null;
  const robotActivePreset = robotDetection?.robot_preset ?? null;

  // Fase "terkunci" (belum unlock): tampilan kontrol hanya menampilkan gesture
  // unlock (Preset 5). Progress bar deteksi memakai progress unlock saat locked,
  // dan progress pengenalan preset saat sudah unlock.
  const isLockedPhase =
    robotFsmState === 'LOCKED' || robotFsmState === 'UNLOCKING';
  const detectionPercent = isLockedPhase ? robotArmPercent : robotPresetPercent;

  // Suara "gesture terdeteksi" — main saat robot BARU masuk fase UNLOCKING
  // (telapak buka mulai terbaca untuk unlock) atau CONFIRMING (gesture preset
  // mulai terbaca). Anchor di TRANSISI state, bukan tiap poll, supaya tidak
  // spam (poll deteksi 150ms).
  // Dibaca DI DALAM effect audio (bukan sebagai dep) untuk menahan cue baru saat
  // sesi sudah masuk fase berakhir — supaya tidak ada narasi sesi yang menyambung
  // ke layar loading sebelum editor/hasil. Disinkronkan via effect di bawah.
  const endingRef = useRef(false);
  const prevFsmRef = useRef<typeof robotFsmState>('LOCKED');
  useEffect(() => {
    const prev = prevFsmRef.current;
    // Sesi sedang berakhir (timer habis / user minta selesai) → jangan mulai
    // narasi/cue sesi lagi. prevFsmRef tetap di-update agar tidak ada play
    // "susulan" begitu state berubah setelahnya.
    if (!endingRef.current && robotFsmState !== prev) {
      if (robotFsmState === 'UNLOCKING' || robotFsmState === 'CONFIRMING') {
        playBackendAudio('tahan.mp3');
      } else if (robotFsmState === 'UNLOCKED') {
        // Kunci terbuka — robot siap menerima gesture preset.
        playBackendAudio('unlock.mp3');
      } else if (robotFsmState === 'LOCKED') {
        // Robot kembali terkunci (mis. setelah foto) — ingatkan user untuk
        // menunjukkan telapak buka lagi. LOCKED awal (mount) ditangani effect
        // inisiasi terpisah, jadi tidak dobel di sini (prevFsmRef mulai dari
        // 'LOCKED').
        playBackendAudio('inisiasi.mp3');
      }
    }
    prevFsmRef.current = robotFsmState;
  }, [robotFsmState]);

  // Re-prompt saat diam: selama LOCKED, tiap 5s tanpa tangan → ulangi inisiasi (maks 3x).
  // Status tangan dibaca via ref DI DALAM interval (bukan deps) supaya flicker
  // deteksi 150ms tidak terus mereset interval sebelum 5 detik tercapai.
  const handDetectedRef = useRef(robotHandDetected);
  // Sinkronkan ref SETELAH render (bukan saat render) — nilai dibaca di dalam
  // interval 5s di bawah, jadi update pasca-commit sudah cukup mutakhir.
  useEffect(() => {
    handDetectedRef.current = robotHandDetected;
  }, [robotHandDetected]);
  useEffect(() => {
    if (robotFsmState !== 'LOCKED') return;
    let count = 0;
    const id = setInterval(() => {
      // Sesi sedang berakhir → hentikan re-prompt supaya tak ada suara sesi
      // yang menyambung ke layar loading.
      if (endingRef.current) return;
      // Tangan muncul → reset hitungan, tunggu diam lagi.
      if (handDetectedRef.current) {
        count = 0;
        return;
      }
      if (count >= 3) return;
      count += 1;
      playBackendAudio('inisiasi.mp3');
    }, 5000);
    return () => clearInterval(id);
  }, [robotFsmState]);

  // Safeguard: jangan akhiri sesi selama robot gerak / countdown shutter jalan
  // supaya foto terakhir tidak ke-cut. Poll 250ms (di-share dgn CameraPreview).
  // `isFetched` menahan end-effect di edge case "refresh tepat saat timer 0":
  // tanpa itu robotConfig undefined → robotBusy=false → grace check ke-skip.
  const { data: robotConfig, isFetched: robotConfigFetched } = useRobotConfig();
  const robotBusy =
    (robotConfig?.current_preset ?? 0) > 0 ||
    robotConfig?.auto_capture_active === true;
  // Sesi dianggap "masih dipakai" bukan hanya saat robot menjepret, tapi juga
  // saat user BARU unlock & sedang berinteraksi (FSM keluar dari LOCKED). Dengan
  // begitu, kalau timer habis tepat saat user sedang unlock, sesi tidak berhenti
  // mendadak — melainkan ditahan dan masuk ke logika grace (waktu minus) sampai
  // hard-cap MAX_GRACE_SEC.
  // Anggap robot "engaged" di SELURUH rangkaian capture — dari user unlock
  // (UNLOCKING/UNLOCKED/CONFIRMING) sampai gerak preset (MOVING) & robot
  // menjepret + simpan foto full-res (COOLDOWN, ±COOLDOWN_AFTER_CAPTURE). Dengan
  // FSM menutup seluruh urutan, latch capture tidak bergantung pada timing flag
  // Go-backend (auto_capture_active) dan lepas TEPAT saat robot balik LOCKED —
  // jadi begitu capture beres, sesi bisa langsung selesai tanpa jeda panjang.
  const robotEngaged =
    robotBusy ||
    robotFsmState === 'UNLOCKING' ||
    robotFsmState === 'UNLOCKED' ||
    robotFsmState === 'CONFIRMING' ||
    robotFsmState === 'MOVING' ||
    robotFsmState === 'COOLDOWN';

  // Latch "capture sedang berlangsung": sekali robot engaged, tetap dianggap
  // aktif sampai robot benar-benar idle STABIL (debounce CAPTURE_SETTLE_MS).
  // Karena `robotEngaged` kini menutup SELURUH urutan capture lewat FSM
  // (termasuk MOVING & COOLDOWN), debounce ini hanya perlu menjembatani skew
  // antar-poll (fsm 150ms vs config 250ms) & celah transisi FSM sub-detik —
  // BUKAN menunggu proses simpan foto. Jadi dibuat pendek supaya begitu robot
  // balik LOCKED (capture betul-betul beres) sesi langsung selesai tanpa jeda.
  const CAPTURE_SETTLE_MS = 800;
  const [captureActive, setCaptureActive] = useState(false);
  const captureReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(() => {
    if (robotEngaged) {
      if (captureReleaseTimerRef.current) {
        clearTimeout(captureReleaseTimerRef.current);
        captureReleaseTimerRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- latch dari state robot eksternal; butuh efek.
      setCaptureActive(true);
    } else if (!captureReleaseTimerRef.current) {
      // Robot idle → tunggu settle sebelum melepas latch (biar bukan cuma celah
      // transisi FSM sesaat). Kalau engaged lagi sebelum timer habis, timer di-
      // clear di cabang atas pada run berikutnya.
      captureReleaseTimerRef.current = setTimeout(() => {
        captureReleaseTimerRef.current = null;
        setCaptureActive(false);
      }, CAPTURE_SETTLE_MS);
    }
  }, [robotEngaged]);
  useEffect(() => {
    return () => {
      if (captureReleaseTimerRef.current)
        clearTimeout(captureReleaseTimerRef.current);
    };
  }, []);

  // Grace counter (detik) saat sessionTimeLeft sudah 0 tapi robot masih busy.
  // Dipakai untuk tampilkan timer negatif (-1, -2, ...) sebagai indikator
  // sesi diperpanjang sementara untuk merampungkan foto.
  const [graceSeconds, setGraceSeconds] = useState(0);

  // User menekan "Selesai sekarang" → percepat alur dengan men-trigger jalur
  // akhir sesi yang sama (broadcast + disable robot + navigate), termasuk
  // safeguard robot-busy & grace. Jadi end bisa terpicu oleh timer ATAU ini.
  const [endRequested, setEndRequested] = useState(false);
  // Tampilkan overlay animasi "menunggu" sebelum navigasi ke halaman berikutnya.
  const [showTransition, setShowTransition] = useState(false);
  // "Sedang menuju akhir sesi" — timer habis atau user minta selesai. Dipakai
  // untuk state tombol (disabled + label "Menyelesaikan foto…").
  const endingNow = endRequested || sessionTimeLeft === 0;

  // Sinkronkan ref "sedang mengakhiri sesi" agar bisa dibaca di dalam effect
  // audio (yang sengaja tidak memasukkan endingNow ke deps supaya tak re-run).
  useEffect(() => {
    endingRef.current = endingNow;
  }, [endingNow]);

  // Grace tick: hanya jalan saat sessionTimeLeft sudah 0 DAN robot masih
  // dipakai (menjepret ATAU user sedang unlock). Mulai dari 1 supaya tampilan
  // langsung "-00:01" tanpa nampung "00:00" sesaat.
  useEffect(() => {
    if (!endingNow || !captureActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset counter timer grace; tak ada cara derive tanpa efek karena ada interval.
      setGraceSeconds(0);
      return;
    }
    setGraceSeconds(1);
    const id = setInterval(() => {
      setGraceSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [endingNow, captureActive]);

  const graceExpired = graceSeconds >= MAX_GRACE_SEC;
  const inGrace = endingNow && captureActive && !graceExpired;
  // Timer yang ditampilkan: negatif saat overtime (menunggu foto selesai).
  const displayTimeLeft = inGrace ? -graceSeconds : sessionTimeLeft;

  // Panel kanan (kartu Gesture Controls + tombol "Selesai"): sembunyikan selama
  // robot sibuk supaya preview kamera bersih saat foto difreeze; tampil lagi
  // saat idle.
  const showGuide = !robotBusy;

  // Liveview besar bergantian: DEFAULT tampil kamera deteksi gesture (robot),
  // lalu PINDAH ke liveview Canon begitu preset dikonfirmasi (robot mulai
  // bergerak/capture). CameraPreview selalu ter-mount di bawah supaya logika
  // countdown/freeze tetap jalan; overlay deteksi gesture yang disembunyikan.
  const showCanonPreview = robotBusy;

  useEffect(() => {
    if (!endingNow || !sessionId) return;
    // Tunggu first poll selesai dulu sebelum decide — kalau tidak, robotBusy
    // bisa false hanya karena query masih loading, dan kita lewatkan grace
    // check (mis. user refresh tepat saat sessionTimeLeft sudah 0).
    if (!robotConfigFetched) return;
    // Tahan end sesi selama SATU capture masih berlangsung — dari user unlock,
    // gerak preset, sampai robot beres capture (latch captureActive menahan lewat
    // celah transisi FSM sesaat). Baru lepas setelah robot idle stabil, atau saat
    // grace hard-cap tercapai.
    if (captureActive && !graceExpired) return;
    if (endFiredRef.current) return;
    endFiredRef.current = true;

    // Sesi benar-benar berakhir → hentikan semua narasi/cue sesi supaya tidak
    // ada audio yang menyambung ke layar loading sebelum editor/hasil.
    stopBackendAudio();

    sendSessionBroadcast({ type: 'SESSION_END', sessionId });

    // Sesi selesai → bersihkan entri timer di sessionStorage
    clearSessionTimer();

    // Sesi selesai → matikan robot. Tandai agar cleanup unmount tidak dobel.
    robotDisabledRef.current = true;
    apiClient.post('/api/robot/disable').catch((err) => {
      console.warn('[PhotoSession] robot/disable failed:', err);
    });

    const isPrint = session?.packageCode === 'vip';
    const target = isPrint
      ? `/photo-editor?sessionId=${sessionId}`
      : `/session-end?sessionId=${sessionId}`;

    setShowTransition(true);

    // Tampilkan dulu loading screen "Preparing…" sejenak sebelum pindah ke
    // editor/hasil — supaya transisi terasa mulus (bukan lompat mendadak). Jeda
    // dibuat pendek: cukup untuk memperlihatkan loader, tanpa terasa lama.
    // VIP: photo-editor dulu untuk pilih frame + foto, lalu session-end.
    // Digital: langsung session-end (tampil QR untuk scan di HP).
    endTimeoutRef.current = setTimeout(() => {
      router.push(target);
    }, 1200);
  }, [
    endingNow,
    sessionId,
    session,
    router,
    clearSessionTimer,
    captureActive,
    graceExpired,
    robotConfigFetched,
  ]);

  if (!sessionId) return null;

  return (
    // Kiosk fullscreen: pakai `fixed inset-0` agar halaman menempel ke viewport
    // dan LEPAS dari container `max-w-360 mx-auto` layout publik (kalau ikut
    // container, bar + preview terkunci 1440px di tengah pada layar lebar).
    // Fixed juga out-of-flow → tidak memicu scroll horizontal di container.
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <div className="px-10 pt-6 shrink-0">
        <SessionHeader sessionTimeLeft={displayTimeLeft} />
      </div>

      <main className="flex flex-1 min-h-0 gap-6 px-10 pb-6 pt-3">
        {/* Kiri — Preview Camera */}
        <div className="flex flex-1 flex-col gap-3 min-h-0 min-w-0">
          <h2 className="text-primary font-medium text-2xl tracking-[0.47px] shrink-0 text-left">
            Preview Camera
          </h2>
          {/* Frame ring biru dipindah ke wrapper ini (bukan di CameraPreview)
              karena `overflow-hidden` — yang dibutuhkan agar panel gesture ter-
              clip rapi saat slide keluar — akan memotong ring milik anak. Ring/
              shadow milik elemen sendiri TIDAK ikut ter-clip oleh overflow-nya. */}
          <div className="relative flex-1 min-h-0 overflow-hidden rounded-[28px] ring-[6px] ring-primary ring-offset-2 ring-offset-transparent shadow-[0_20px_60px_-15px_rgba(63,114,175,0.45)]">
            <CameraPreview
              frameUrl={frameUrl}
              sessionId={sessionId}
              hasError={hasError}
              errorMessage={errorMessage}
              onError={handleStreamError}
              onRetry={retryStream}
            />
            {/* Overlay liveview deteksi gesture — menutup preview Canon SELAMA
                belum ada preset terkonfirmasi. Begitu preset dikonfirmasi
                (showCanonPreview true), overlay SLIDE keluar ke kiri → tampil
                liveview Canon (CameraPreview di bawah) untuk countdown & hasil.
                Tetap ter-mount (transform di-toggle) supaya perpindahan kamera
                mulus, bukan berkedip; di-clip oleh wrapper (overflow-hidden).
                Freeze hasil (z-50, fixed) tetap menang di atas overlay ini. */}
            <div
              className={cn(
                'absolute inset-0 z-30 rounded-[28px] overflow-hidden transition-transform duration-500 ease-in-out',
                showCanonPreview
                  ? '-translate-x-[105%] pointer-events-none'
                  : 'translate-x-0',
              )}
            >
              <GestureDetectionPanel
                streamUrl={robotStreamUrl}
                reachable={robotReachable}
                fsmState={robotFsmState}
                armPercent={robotArmPercent}
                presetPercent={robotPresetPercent}
                gestureName={robotGestureName}
                activePresetName={robotActivePreset}
                className="h-full rounded-[28px]"
              />
            </div>
          </div>
        </div>

        {/* Kanan — 2 kartu: Gesture Detection (bar + info preset, ringkas) di
            atas, lalu Gesture Controls. Muncul saat robot idle dengan animasi
            slide-in dari kanan; hilang saat robot sibuk. */}
        {showGuide && (
          <div className="flex w-[26rem] 2xl:w-[30rem] shrink-0 flex-col gap-4 min-h-0 animate-[slideInRight_350ms_ease-out]">
            {/* Gesture Detection — kartu ringkas: bar progress deteksi + info
                preset/gesture. Tanpa label Locked/Unlocked (sudah tampil besar
                di liveview). */}
            <div className="flex shrink-0 flex-col gap-3">
              <h2 className="text-primary font-medium text-2xl tracking-[0.47px]">
                Gesture Detection
              </h2>
              <div
                className={cn(
                  'flex flex-col gap-3 bg-primary/75 px-5 py-4',
                  PREVIEW_FRAME,
                )}
              >
                {/* Label progress + persen */}
                <div className="flex items-center justify-between">
                  <span className="text-base font-medium text-white/80">
                    {isLockedPhase ? 'Unlock progress' : 'Gesture progress'}
                  </span>
                  <span className="text-lg font-bold tabular-nums text-white">
                    {Math.round(detectionPercent)}%
                  </span>
                </div>

                {/* Bar progress deteksi — warna tema (blue-100) di atas track
                    gelap supaya tetap jelas. */}
                <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-blue-100 transition-all duration-200 ease-linear"
                    style={{
                      width: `${Math.max(0, Math.min(100, detectionPercent))}%`,
                    }}
                  />
                </div>

                {/* Info preset / gesture terdeteksi */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/55">Detected</span>
                  <span className="font-medium text-white">
                    {robotActivePreset
                      ? `Preset ${robotActivePreset}`
                      : robotGestureName
                        ? robotGestureName
                        : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Gesture Controls — mengisi sisa tinggi kolom. Sebelum unlock
                hanya menampilkan gesture Preset 5 (telapak terbuka) sebagai
                ajakan unlock; setelah unlock baru tampilkan semua preset. */}
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <h2 className="text-primary font-medium text-2xl tracking-[0.47px] shrink-0">
                Gesture Controls
              </h2>
              <div
                className={cn(
                  'flex min-h-0 flex-1 flex-col gap-4 bg-primary/75 p-5',
                  PREVIEW_FRAME,
                )}
              >
                {/* Konten swap locked↔unlocked — di-`key` per fase supaya React
                    me-remount & memainkan animasi slide tiap kali berpindah.
                    Arah slide directional: unlock masuk dari KANAN, kembali
                    locked masuk dari KIRI. Tombol "Selesai" di luar wrapper agar
                    tetap diam (tak ikut beranimasi). */}
                <div
                  key={isLockedPhase ? 'locked' : 'unlocked'}
                  className={cn(
                    'flex min-h-0 flex-1 flex-col',
                    isLockedPhase
                      ? 'animate-[slideInLeft_350ms_ease-out]'
                      : 'animate-[slideInRight_350ms_ease-out]',
                  )}
                >
                {isLockedPhase ? (
                  /* Belum unlock → hanya gesture unlock (telapak terbuka) besar,
                     tanpa label preset. Di atas gambar ada pengingat "satu tangan
                     saja" (samakan dengan guideline di halaman intro). */
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-between px-6 py-8 text-center">
                    <p className="text-2xl 2xl:text-3xl font-semibold text-white/85">
                      Only one person’s hand at a time
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={PRESET_GESTURES[4]?.icon ?? '/finger/STOP.svg'}
                      alt="Open palm to unlock"
                      className="h-56 w-56 2xl:h-64 2xl:w-64 object-contain"
                    />
                    <p className="text-2xl 2xl:text-3xl font-semibold text-white/85">
                      Show this gesture to unlock
                    </p>
                  </div>
                ) : (
                  /* Sudah unlock → semua preset, 2 kolom × 5 baris, ikon lebih
                     besar & rapi. */
                  <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-5 gap-3 2xl:gap-4">
                    {PRESET_GESTURES.map((g, i) => (
                      <div
                        key={`${g.name}-${i}`}
                        className="flex min-h-0 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2 text-center"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={g.icon ?? ''}
                          alt={`Preset ${i + 1}`}
                          className={cn(
                            'h-12 w-12 2xl:h-15 2xl:w-15 object-contain',
                            // Preset 6 (Move Left) — gambar diputar 100° ke kanan
                            // supaya jempol menghadap ke atas.
                            g.icon?.includes('MOVELEFT') && 'rotate-[100deg]',
                          )}
                        />
                        <span className="text-sm 2xl:text-base font-semibold text-white">
                          Preset {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                </div>

                {/* Tombol "Selesai sekarang" — selalu tampil di bawah kartu. */}
                <EndSessionButton
                  onEnd={() => setEndRequested(true)}
                  ending={endingNow}
                  className="w-full justify-center"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {showTransition && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-lg">
          <StatusAnimation status="processing" className="w-32 h-32" />
          <p className="mt-4 text-xl font-medium text-white/80 animate-pulse">
            Preparing your photos...
          </p>
        </div>
      )}
    </div>
  );
}
