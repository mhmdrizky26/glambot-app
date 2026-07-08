'use client';

import { SessionHeader } from '../components/SessionHeader';
import { CameraPreview } from '../components/CameraPreview';
import EndSessionButton from '../components/EndSessionButton';
import { GestureDetectionPanel } from '../components/GestureDetectionPanel';
import { instructionSteps } from '@/features/public/instruction/data/steps';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useGetSession } from '@/shared/api/session';
import { sendSessionBroadcast } from '../lib/broadcastChannel';
import { useLiveStream } from '../api/getLivePreview';
import { useRobotConfig } from '../api/getRobotConfig';
import { useRobotDetection } from '../api/getRobotDetection';
import { apiClient } from '@/lib/api-client';
import { playBackendAudio } from '@/lib/audio';
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

  // Suara "gesture terdeteksi" — main saat robot BARU masuk fase UNLOCKING
  // (telapak buka mulai terbaca untuk unlock) atau CONFIRMING (gesture preset
  // mulai terbaca). Anchor di TRANSISI state, bukan tiap poll, supaya tidak
  // spam (poll deteksi 150ms).
  const prevFsmRef = useRef<typeof robotFsmState>('LOCKED');
  useEffect(() => {
    const prev = prevFsmRef.current;
    if (robotFsmState !== prev) {
      if (robotFsmState === 'UNLOCKING' || robotFsmState === 'CONFIRMING') {
        playBackendAudio('GestureTerdeteksi.mp3');
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
  // Grace counter (detik) saat sessionTimeLeft sudah 0 tapi robot masih busy.
  // Dipakai untuk tampilkan timer negatif (-1, -2, ...) sebagai indikator
  // sesi diperpanjang sementara untuk merampungkan foto.
  const [graceSeconds, setGraceSeconds] = useState(0);

  // User menekan "Selesai sekarang" → percepat alur dengan men-trigger jalur
  // akhir sesi yang sama (broadcast + disable robot + navigate), termasuk
  // safeguard robot-busy & grace. Jadi end bisa terpicu oleh timer ATAU ini.
  const [endRequested, setEndRequested] = useState(false);
  // "Sedang menuju akhir sesi" — timer habis atau user minta selesai. Dipakai
  // untuk state tombol (disabled + label "Menyelesaikan foto…").
  const endingNow = endRequested || sessionTimeLeft === 0;

  // Grace tick: hanya jalan saat sessionTimeLeft sudah 0 DAN robot masih
  // busy. Mulai dari 1 supaya tampilan langsung "-00:01" tanpa nampung
  // "00:00" sesaat.
  useEffect(() => {
    if (!endingNow || !robotBusy) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset counter timer grace; tak ada cara derive tanpa efek karena ada interval.
      setGraceSeconds(0);
      return;
    }
    setGraceSeconds(1);
    const id = setInterval(() => {
      setGraceSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [endingNow, robotBusy]);

  const graceExpired = graceSeconds >= MAX_GRACE_SEC;
  const inGrace = endingNow && robotBusy && !graceExpired;
  // Timer yang ditampilkan: negatif saat overtime (menunggu foto selesai).
  const displayTimeLeft = inGrace ? -graceSeconds : sessionTimeLeft;

  // Panel kanan (2 kartu + tombol "Selesai"): sembunyikan selama robot sibuk
  // supaya preview kamera bersih saat foto difreeze; tampil lagi saat idle.
  const showGuide = !robotBusy;

  // Animasi popup panel kanan: keluar (robot sibuk) langsung slide+fade; masuk
  // (idle lagi) ditunda ~450ms supaya kartu muncul setelah freeze foto settle.
  // `guideMounted` = ada di DOM, `guideVisible` = state transisi.
  const [guideMounted, setGuideMounted] = useState(showGuide);
  const [guideVisible, setGuideVisible] = useState(showGuide);
  useEffect(() => {
    if (showGuide) {
      const enterDelay = setTimeout(() => {
        setGuideMounted(true);
        // Frame berikutnya supaya kelas "masuk" ter-transisi dari state awal.
        requestAnimationFrame(() => setGuideVisible(true));
      }, 450);
      return () => clearTimeout(enterDelay);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkron animasi enter/exit panduan dengan transisi 300ms; butuh efek.
    setGuideVisible(false);
    // Tunggu durasi transisi sebelum benar-benar unmount (hentikan polling).
    const id = setTimeout(() => setGuideMounted(false), 300);
    return () => clearTimeout(id);
  }, [showGuide]);

  useEffect(() => {
    if (!endingNow || !sessionId) return;
    // Tunggu first poll selesai dulu sebelum decide — kalau tidak, robotBusy
    // bisa false hanya karena query masih loading, dan kita lewatkan grace
    // check (mis. user refresh tepat saat sessionTimeLeft sudah 0).
    if (!robotConfigFetched) return;
    // Tahan end sesi selama robot masih sibuk (sampai grace hard-cap).
    if (robotBusy && !graceExpired) return;
    if (endFiredRef.current) return;
    endFiredRef.current = true;

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

    const timeout = setTimeout(() => {
      // VIP: photo-editor dulu untuk pilih frame + foto, lalu session-end.
      // Digital: langsung session-end (tampil QR untuk scan di HP).
      router.push(target);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [
    endingNow,
    sessionId,
    session,
    router,
    clearSessionTimer,
    robotBusy,
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
          <div className="relative flex-1 min-h-0">
            <CameraPreview
              frameUrl={frameUrl}
              sessionId={sessionId}
              hasError={hasError}
              errorMessage={errorMessage}
              onError={handleStreamError}
              onRetry={retryStream}
            />
          </div>
        </div>

        {/* Kanan — 2 card: Gesture Detection + Gesture Controls. Keduanya
            disembunyikan saat preset terdeteksi (fitur "hide" yang sudah ada),
            dengan animasi popup: muncul slide dari kanan, hilang slide ke kanan. */}
        {guideMounted && (
          <div
            className={cn(
              'flex w-[26rem] 2xl:w-[30rem] shrink-0 flex-col gap-4 min-h-0',
              'transition-all duration-300 ease-out will-change-transform',
              guideVisible
                ? 'translate-x-0 scale-100 opacity-100'
                : 'translate-x-8 scale-95 opacity-0',
            )}
          >
            {/* Gesture Detection */}
            <div className="flex shrink-0 flex-col gap-3">
              <h2 className="text-primary font-medium text-2xl tracking-[0.47px]">
                Gesture Detection
              </h2>
              <div className="h-64">
                <GestureDetectionPanel
                  streamUrl={robotStreamUrl}
                  reachable={robotReachable}
                  fsmState={robotFsmState}
                  armPercent={robotArmPercent}
                  presetPercent={robotPresetPercent}
                  gestureName={robotGestureName}
                  activePresetName={robotActivePreset}
                  className={PREVIEW_FRAME}
                />
              </div>
            </div>

            {/* Gesture Controls */}
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <h2 className="text-primary font-medium text-2xl tracking-[0.47px] shrink-0">
                Gesture Controls
              </h2>
              <div
                className={cn(
                  'flex min-h-0 flex-1 flex-col gap-5 bg-primary/75 p-5',
                  PREVIEW_FRAME,
                )}
              >
                {/* Grid preset mengisi ruang sisa & rownya di-tengah-kan secara
                    vertikal (content-center) → tidak ada celah kosong yang
                    nyangkut di satu sisi; jarak atas-bawah simetris. */}
                <div className="grid flex-1 grid-cols-5 2xl:grid-cols-4 content-center gap-2.5 2xl:gap-3">
                  {PRESET_GESTURES.map((g, i) => (
                    <div
                      key={`${g.name}-${i}`}
                      className="flex aspect-square flex-col items-center justify-center gap-1.5 2xl:gap-2 rounded-xl border border-white/10 bg-white/5 p-2 text-center"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={g.icon ?? ''}
                        alt={`Preset ${i + 1}`}
                        className={cn(
                          'h-8 w-8 2xl:h-12 2xl:w-12 object-contain',
                          // Preset 6 (Move Left) — gambar diputar 100° ke kanan
                          // supaya jempol menghadap ke atas.
                          g.icon?.includes('MOVELEFT') && 'rotate-[100deg]',
                        )}
                      />
                      <span className="text-[11px] 2xl:text-sm font-semibold text-white">
                        Preset {i + 1}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Aturan keselamatan + tombol — dikelompokkan di bawah dengan
                    jarak konsisten. */}
                <div className="space-y-1.5 border-t border-white/10 pt-4 text-[11px] leading-relaxed text-white/40">
                  <p className="text-amber-300/70">
                    ⚠ Stay at least 2 meters away from robot arm
                  </p>
                  <p>Keep gestures within detection area</p>
                  <p>Avoid sudden movement near robot arm</p>
                </div>

                {/* Tombol "Selesai sekarang" — dipindah ke pojok kanan-bawah
                    kartu ini supaya preview kamera bersih tanpa tombol melayang. */}
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
    </div>
  );
}
