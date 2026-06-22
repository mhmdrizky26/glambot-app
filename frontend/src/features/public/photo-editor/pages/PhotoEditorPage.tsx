'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fabric } from 'fabric';

import { StatusAnimation } from '@/components/shared/StatusAnimation';
import Timer from '@/components/shared/Timer';
import PhotoSelectionPanel from '../components/PhotoSelectionPanel';
import PreviewArea from '../components/PreviewArea';
import FrameSelectionPanel from '../components/FrameSelectionPanel';
import ConfirmPrintButton from '../components/ConfirmPrintButton';
import SlotAdjustToolbar from '../components/SlotAdjustToolbar';
import { zoomPhoto, rotatePhoto, resetPhoto } from '../lib/slotTransform';

import { usePhotos } from '../api/getPhotos';
import { useFrames } from '../api/getFrames';
import type { Frame } from '../api/getFrames';
import { exportComposition } from '../lib/exportComposition';
import { useSaveComposition } from '../api/saveComposition';
import { printComposition } from '../api/printComposition';
import { usePhotoComposition } from '../hooks/usePhotoComposition';
import type { FilterType } from '../lib/filters';

// FilterType didefinisikan kanonik di lib/filters; di-re-export di sini supaya
// import lama `from '../pages/PhotoEditorPage'` tetap berfungsi tanpa drift.
export type { FilterType };

type TabType = 'frame' | 'filter';

export default function PhotoEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) router.replace('/package');
  }, [sessionId, router]);

  // State
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('original');
  const [activeTab, setActiveTab] = useState<TabType>('frame');
  // Slot foto yang sedang dipilih di canvas (dilaporkan PreviewArea) → toolbar
  // adjust dirender di baris bawah, sejajar Confirm Print (tidak menutupi preview).
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  // Jalankan aksi toolbar (zoom/rotate/reset) pada foto aktif, lalu re-render.
  const withActivePhoto = (fn: (obj: fabric.Object) => void) => {
    const canvas = fabricCanvasRef.current;
    const obj = canvas?.getActiveObject();
    if (!canvas || !obj || !obj.data?.isPhoto) return;
    fn(obj);
    obj.setCoords();
    canvas.requestRenderAll();
  };
  // Dedup navigation — Timer dan saveComposition.onSuccess sama-sama push
  // ke /session-end. Tanpa flag ini, mereka bisa double-push kalau fire
  // hampir bersamaan (user klik Confirm di detik ~118, timer expire di 120).
  const navigatedRef = useRef(false);

  const navigateToSessionEnd = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.push(`/session-end?sessionId=${sessionId}`);
  };

  // Photo composition tracking
  const {
    slots,
    addPhotoToSlot,
    setFrame: setCompositionFrame,
    setFilter: setCompositionFilter,
  } = usePhotoComposition();

  // Fetch data — disable photos query saat sessionId kosong (saat halaman
  // mounted tanpa param, useEffect di atas akan redirect, tapi kita tetap
  // perlu hindari request ke `/api/photo/session/` yang invalid).
  const { data: photos = [], isLoading: photosLoading } = usePhotos({
    sessionId,
    queryConfig: { enabled: !!sessionId },
  });

  const { data: frames = [], isLoading: framesLoading } = useFrames();

  // Save composition mutation
  const { mutate: saveComposition, isPending: isSaving } = useSaveComposition();

  // Loading state — juga handle case sessionId kosong, supaya halaman
  // menampilkan spinner sembari router.replace('/package') jalan, BUKAN
  // return null lebih awal yang akan melanggar Rules of Hooks (hooks di
  // atas sudah dipanggil, conditional early return akan skip render saja).
  if (!sessionId || photosLoading || framesLoading) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <StatusAnimation status="waiting" className="w-24 h-24" />
      </div>
    );
  }

  // Frame and filter selection handlers
  const handleFrameSelect = (frame: Frame) => {
    setSelectedFrame(frame);
    setCompositionFrame(frame);
  };

  const handleFilterSelect = (filter: FilterType) => {
    setSelectedFilter(filter);
    setCompositionFilter(filter);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  // Handle photo dropped into slot
  const handlePhotoDropped = (
    slotId: string,
    photoId: string,
    photoUrl: string,
  ) => {
    addPhotoToSlot(slotId, photoId, photoUrl);
  };

  // Confirm Print logic
  const isConfirmEnabled = selectedFrame !== null;

  // `silent: true` dipakai saat trigger dari timer — error di-log tapi tidak
  // alert, dan saat fail tetap navigate supaya user tidak stuck di halaman.
  const handleConfirmPrint = async (options?: { silent?: boolean }) => {
    if (!isConfirmEnabled || !fabricCanvasRef.current) {
      if (options?.silent) navigateToSessionEnd();
      return;
    }

    const silent = options?.silent === true;

    try {
      // Collect photo IDs from slots
      const photoIds = Object.values(slots)
        .filter((slot) => slot.photoId !== null)
        .map((slot) => slot.photoId as string);

      // Backend `/api/photo/compose` (lewat strip generator) berasumsi 3 slot
      // terisi — kalau kurang, GIF + framed strip jadi tidak konsisten. Block
      // di sini supaya user dapat alert yang jelas, bukan error 400 dari
      // server. Saat timer-triggered (silent), tetap navigate ke session-end
      // tanpa save: user sudah kehabisan waktu.
      if (photoIds.length < 3) {
        if (silent) {
          console.warn(
            '[PhotoEditorPage] Timer expired with',
            photoIds.length,
            'photo(s) selected — skipping save, navigating anyway',
          );
          navigateToSessionEnd();
          return;
        }
        alert(`Please select 3 photos first (currently ${photoIds.length}/3).`);
        return;
      }

      // Export canvas at high resolution (kept in-memory; user downloads from
      // /download-photos page, not auto-saved to local directory)
      const exported = await exportComposition(fabricCanvasRef.current, {
        format: 'jpeg',
        quality: 0.95,
        multiplier: 3,
      });

      // Save composition to backend, then redirect to download page
      saveComposition(
        {
          sessionId,
          frameId: selectedFrame!.id,
          filter: selectedFilter,
          photoIds,
          composedImage: exported.blob,
        },
        {
          onSuccess: () => {
            // Saat user menekan Confirm Print (bukan timer), langsung kirim
            // strip ke printer fisik. Non-blocking & non-fatal: kalau printer
            // offline/gagal, user tetap lanjut ke halaman download.
            if (!silent) {
              printComposition(sessionId).catch((err) => {
                console.warn('[PhotoEditorPage] auto-print gagal:', err);
              });
            }
            navigateToSessionEnd();
          },
          onError: (error) => {
            console.error('Failed to save composition:', error);
            if (silent) {
              // Timer-triggered: navigate anyway, jangan stuck user.
              navigateToSessionEnd();
            } else {
              alert('Failed to save composition. Please try again.');
            }
          },
        },
      );
    } catch (error) {
      console.error('Export failed:', error);
      if (silent) {
        navigateToSessionEnd();
      } else {
        alert('Failed to export composition. Please try again.');
      }
    }
  };

  // Timer habis = otomatis "klik" Confirm Print supaya komposisi ter-save
  // dulu (frame + foto), baru navigate. Kalau user belum pilih frame, langsung
  // navigate tanpa save.
  const handleTimeUp = () => {
    handleConfirmPrint({ silent: true });
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* 2 menit untuk pilih frame + foto, lalu auto ke session-end */}
      <Timer
        duration={120}
        onTimeUp={handleTimeUp}
        storageKey={sessionId ? `photo-editor:${sessionId}` : null}
      />

      {/* Header */}
      <div className="w-full text-center py-1 shrink-0">
        <h1 className="text-primary text-[60px] font-bold tracking-tight">
          Select & Edit
        </h1>
      </div>

      {/* Main Content - 3 panels + confirm button */}
      <div className="flex-1 flex flex-col min-h-0 px-6 pb-6 gap-3">
        {/* Panels row */}
        <div className="flex-1 flex items-stretch gap-3 min-h-0">
          {/* Left Panel */}
          <div className="w-84.25 shrink-0">
            <PhotoSelectionPanel photos={photos} isLoading={photosLoading} />
          </div>

          {/* Center Panel */}
          <div className="flex-1 min-w-0 flex items-center justify-center">
            <PreviewArea
              selectedFrame={selectedFrame}
              selectedFilter={selectedFilter}
              onPhotoDropped={handlePhotoDropped}
              onActiveSlotChange={setActiveSlotId}
              onCanvasReady={(canvas) => {
                fabricCanvasRef.current = canvas;
              }}
            />
          </div>

          {/* Right Panel */}
          <div className="w-84.25 shrink-0">
            <FrameSelectionPanel
              frames={frames}
              selectedFrame={selectedFrame}
              selectedFilter={selectedFilter}
              activeTab={activeTab}
              onFrameSelect={handleFrameSelect}
              onFilterSelect={handleFilterSelect}
              onTabChange={handleTabChange}
            />
          </div>
        </div>

        {/* Baris bawah: toolbar adjust (tengah, sejajar kolom preview) +
            Confirm Print (kanan). Toolbar di sini, BUKAN di atas preview,
            supaya tidak menutupi foto. */}
        <div className="flex items-center gap-3">
          {/* spacer selebar panel kiri agar toolbar pas di bawah preview */}
          <div className="w-84.25 shrink-0" />
          <div className="flex-1 min-w-0 flex justify-center">
            {activeSlotId && (
              <SlotAdjustToolbar
                onZoomIn={() => withActivePhoto((o) => zoomPhoto(o, 1))}
                onZoomOut={() => withActivePhoto((o) => zoomPhoto(o, -1))}
                onRotateLeft={() => withActivePhoto((o) => rotatePhoto(o, -1))}
                onRotateRight={() => withActivePhoto((o) => rotatePhoto(o, 1))}
                onReset={() => withActivePhoto((o) => resetPhoto(o))}
              />
            )}
          </div>
          <div className="w-84.25 shrink-0">
            <ConfirmPrintButton
              disabled={!isConfirmEnabled}
              onClick={handleConfirmPrint}
            />
          </div>
        </div>
      </div>

      {/* Loading overlay during save */}
      {isSaving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <StatusAnimation status="waiting" className="w-16 h-16" />
          </div>
        </div>
      )}
    </div>
  );
}
