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

  // Guard: sesi belum dibayar / kedaluwarsa tidak boleh masuk sesi foto.
  // Tunggu data FRESH (jangan bertindak saat fetching) agar cache 'pending_payment'
  // lama tepat setelah bayar tidak salah me-redirect user. Backend juga menolak
  // transisi ke 'shooting' tanpa 'paid' sebagai batas keamanan sebenarnya.
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

  // Track robot state untuk safeguard: jangan akhiri sesi kalau robot masih
  // gerak / countdown shutter masih berjalan — biar foto terakhir tidak
  // ke-cut di tengah jepretan. Polling 250ms (di-share dengan CameraPreview
  // via React Query, single underlying request).
  //
  // `isFetched` jadi true setelah request pertama RESOLVES (success/error).
  // Dipakai untuk menahan end-effect di edge case "refresh tepat saat
  // sessionTimeLeft sudah 0" — kalau tidak, robotConfig masih undefined
  // → robotBusy=false → end fire tanpa kasih kesempatan grace check.
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

  // Visibilitas panel kanan (2 kartu + tombol "Selesai" yang kini ada di kartu
  // ke-2): SEMBUNYIKAN selama robot sibuk (gesture aktif / sedang menjepret)
  // supaya preview kamera bersih saat foto difreeze. TAMPILKAN saat robot idle —
  // termasuk saat proses akhir sesi (endingNow) agar tombol bisa menampilkan
  // status "Menyelesaikan foto…".
  const showGuide = !robotBusy;

  // Animasi popup untuk panel kanan dengan masuk/keluar yang berbeda:
  // - KELUAR (robot mulai sibuk): langsung mainkan slide-ke-kanan + fade.
  // - MASUK (robot idle lagi): ditunda sejenak supaya kartu baru muncul SETELAH
  //   freeze foto selesai & preview settle — menghindari kartu menyembul saat
  //   layar masih sibuk (terasa "belibet").
  // `guideMounted` = apakah ada di DOM, `guideVisible` = state transisi.
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

    // Sesi selesai → matikan robot
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
                <GestureDetectionPanel streamUrl={frameUrl} />
              </div>
            </div>

            {/* Gesture Controls */}
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <h2 className="text-primary font-medium text-2xl tracking-[0.47px] shrink-0">
                Gesture Controls
              </h2>
              <div className="flex min-h-0 flex-1 flex-col gap-5 rounded-2xl border border-white/10 bg-primary/75 p-5 shadow-lg">
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
                        className="h-8 w-8 2xl:h-12 2xl:w-12 object-contain"
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
                    ⚠ Stay at least 3 meters away from robot arm
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
