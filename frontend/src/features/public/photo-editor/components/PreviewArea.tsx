'use client';

import { useEffect, useState, useRef } from 'react';
import { fabric } from 'fabric';
import type { Frame, FrameSlot } from '../api/getFrames';
import type { FilterType } from '../pages/PhotoEditorPage';
import { useCanvasRenderer } from '../hooks/useCanvasRenderer';
import {
  loadFrameImage,
  removePhotoBySlotId,
  organizeCanvasLayers,
} from '../lib/fabricCanvas';
import { fitPhotoToSlot } from '../lib/photoFitting';
import { applyFilterToComposition } from '../lib/filters';
import { clampPhotoToSlot } from '../lib/slotTransform';
import { cn } from '@/lib/utils';

/** Fallback canvas dimensions bila frame tidak menyimpan ukuran (2:3, 4R). */
const DEFAULT_CANVAS_W = 464;
const DEFAULT_CANVAS_H = 696;

interface PreviewAreaProps {
  selectedFrame: Frame | null;
  selectedFilter: FilterType;
  // Foto yang sedang dipilih di panel kiri ("armed"). Saat != null, slot pada
  // preview jadi target tap untuk menempatkan foto ini.
  armedPhoto: { photoId: string; photoUrl: string } | null;
  onPhotoPlaced?: (slotId: string, photoId: string, photoUrl: string) => void;
  onCanvasReady?: (canvas: fabric.Canvas) => void;
  // Notifikasi slot foto yang sedang dipilih (null = tidak ada). Parent memakai
  // ini untuk menampilkan toolbar adjust di luar area preview.
  onActiveSlotChange?: (slotId: string | null) => void;
}

export default function PreviewArea({
  selectedFrame,
  selectedFilter,
  armedPhoto,
  onPhotoPlaced,
  onCanvasReady,
  onActiveSlotChange,
}: PreviewAreaProps) {
  // Render di ruang koordinat asli frame (sama dengan slot disimpan di admin).
  // Server-side GIF & print sudah canvas-aware, jadi cukup samakan di sini.
  const CANVAS_W = selectedFrame?.canvasWidth || DEFAULT_CANVAS_W;
  const CANVAS_H = selectedFrame?.canvasHeight || DEFAULT_CANVAS_H;

  const { canvasRef, fabricCanvas, getFabricCanvas } = useCanvasRenderer({
    width: CANVAS_W,
    height: CANVAS_H,
  });

  const loadedSlotsRef = useRef<Set<string>>(new Set());
  const loadedFrameIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // Slot yang sudah terisi foto — dipakai untuk render overlay (reactive; ref
  // loadedSlotsRef tidak memicu re-render, jadi butuh state terpisah).
  const [filledSlots, setFilledSlots] = useState<Set<string>>(new Set());
  // Slot foto yang sedang dipilih user → memunculkan toolbar adjust + highlight.
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  // Reset pilihan saat frame berganti (canvas dibersihkan, semua foto hilang).
  // Pakai pola "set state saat render dari nilai render sebelumnya" — bukan di
  // dalam effect — supaya tidak memicu cascading render (react-hooks rule).
  const prevFrameIdRef = useRef<string | null>(selectedFrame?.id ?? null);
  if ((selectedFrame?.id ?? null) !== prevFrameIdRef.current) {
    prevFrameIdRef.current = selectedFrame?.id ?? null;
    if (activeSlotId !== null) setActiveSlotId(null);
    if (filledSlots.size > 0) setFilledSlots(new Set());
  }

  // Notify parent when canvas is ready
  useEffect(() => {
    if (fabricCanvas && onCanvasReady) {
      onCanvasReady(fabricCanvas);
    }
  }, [fabricCanvas, onCanvasReady]);

  // Compute scale to fit canvas into container
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !selectedFrame) return;

    const updateScale = () => {
      const { clientWidth, clientHeight } = container;
      const s = Math.min(clientWidth / CANVAS_W, clientHeight / CANVAS_H);
      setScale(s);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [selectedFrame, CANVAS_W, CANVAS_H]);

  // Load frame when selection changes.
  // Pakai instance canvas hidup dari ref (getFabricCanvas), BUKAN nilai closure
  // `fabricCanvas`. Saat dimensi frame berubah, canvas lama di-dispose & dibuat
  // ulang dalam commit yang sama; closure `fabricCanvas` masih menunjuk canvas
  // mati sehingga `.clear()` di atasnya melempar "clearRect of null". `fabricCanvas`
  // tetap di dependency hanya sebagai pemicu re-run setelah canvas dibuat ulang.
  useEffect(() => {
    const canvas = getFabricCanvas();
    if (!canvas) return;

    if (!selectedFrame) {
      canvas.clear();
      loadedSlotsRef.current.clear();
      loadedFrameIdRef.current = null;
      return;
    }

    const frameId = selectedFrame.id;
    if (loadedFrameIdRef.current === frameId) return;

    canvas.clear();
    loadedSlotsRef.current.clear();
    loadedFrameIdRef.current = frameId;

    loadFrameImage(canvas, selectedFrame.imageUrl)
      .then(() => {
        organizeCanvasLayers(canvas);
      })
      .catch((err) => {
        console.error('Failed to load frame:', err);
        loadedFrameIdRef.current = null;
      });
    // Sengaja re-run hanya saat id frame berubah (bukan tiap perubahan objek
    // selectedFrame); imageUrl terikat pada id & dijaga loadedFrameIdRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFrame?.id, fabricCanvas, getFabricCanvas]);

  // Apply filter when selectedFilter changes
  useEffect(() => {
    const canvas = getFabricCanvas();
    if (!canvas) return;

    applyFilterToComposition(canvas, selectedFilter);
  }, [selectedFilter, fabricCanvas, getFabricCanvas]);

  // Selection + drag-clamp wiring. Pakai instance `fabricCanvas` (state) supaya
  // listener selalu nempel ke canvas terbaru (canvas dibuat ulang saat dimensi
  // frame berubah). Saat foto dipilih → tampilkan toolbar; saat di-drag (untuk
  // reposisi dalam slot) → clamp agar foto tetap menutupi slot (tak ada celah).
  useEffect(() => {
    const canvas = fabricCanvas;
    if (!canvas) return;

    const syncActive = () => {
      const obj = canvas.getActiveObject();
      setActiveSlotId(obj?.data?.isPhoto ? (obj.data.slotId as string) : null);
    };
    const handleMoving = (e: fabric.IEvent) => {
      const obj = e.target;
      if (obj?.data?.isPhoto) clampPhotoToSlot(obj);
    };

    canvas.on('selection:created', syncActive);
    canvas.on('selection:updated', syncActive);
    canvas.on('selection:cleared', syncActive);
    canvas.on('object:moving', handleMoving);

    return () => {
      canvas.off('selection:created', syncActive);
      canvas.off('selection:updated', syncActive);
      canvas.off('selection:cleared', syncActive);
      canvas.off('object:moving', handleMoving);
    };
  }, [fabricCanvas]);

  // Beri tahu parent slot aktif berubah → parent render toolbar adjust di luar
  // area preview (sejajar tombol Confirm, agar tidak menutupi foto).
  useEffect(() => {
    onActiveSlotChange?.(activeSlotId);
  }, [activeSlotId, onActiveSlotChange]);

  // Tap slot → tempatkan foto yang sedang "armed". Menggantikan drag & drop:
  // user tap foto di panel kiri, lalu tap slot ini. Kalau slot sudah terisi,
  // foto lama diganti.
  const placePhotoInSlot = (slot: FrameSlot) => {
    const canvas = getFabricCanvas();
    if (!canvas || !armedPhoto) return;

    if (loadedSlotsRef.current.has(slot.id)) {
      removePhotoBySlotId(canvas, slot.id);
      loadedSlotsRef.current.delete(slot.id);
    }

    fitPhotoToSlot(armedPhoto.photoUrl, slot, canvas)
      .then((img) => {
        loadedSlotsRef.current.add(slot.id);
        setFilledSlots((prev) => new Set(prev).add(slot.id));
        organizeCanvasLayers(canvas);
        // Langsung pilih foto yang baru ditempatkan → toolbar adjust muncul.
        canvas.setActiveObject(img);
        setActiveSlotId(slot.id);
        canvas.requestRenderAll();
        onPhotoPlaced?.(slot.id, armedPhoto.photoId, armedPhoto.photoUrl);
      })
      .catch((err) => {
        console.error('Failed to load photo:', err);
      });
  };

  // Overlay tiap slot: menampilkan nomor + jadi target tap. Saat ada foto armed,
  // overlay aktif (bisa di-tap untuk menempatkan). Saat tidak, overlay
  // pointer-events-none supaya tap tembus ke foto di canvas (untuk pilih/adjust).
  const renderSlotOverlays = () => {
    if (!selectedFrame?.slots) return null;

    return selectedFrame.slots.map((slot, i) => {
      const number = i + 1;
      const filled = filledSlots.has(slot.id);
      const prominent = !!armedPhoto || !filled; // nomor menonjol di tengah

      return (
        <button
          key={slot.id}
          type="button"
          disabled={!armedPhoto}
          onClick={() => placePhotoInSlot(slot)}
          className={cn(
            'absolute flex items-center justify-center rounded-md transition-all duration-150',
            // Tanpa garis tepi pada frame — hanya nomor slot. Saat ada foto armed,
            // slot bisa di-tap (feedback tipis saat ditekan).
            armedPhoto
              ? 'pointer-events-auto cursor-pointer active:bg-[#3F72AF]/25'
              : 'pointer-events-none',
          )}
          style={{
            left: slot.x * scale,
            top: slot.y * scale,
            width: slot.width * scale,
            height: slot.height * scale,
          }}
        >
          <span
            className={cn(
              'flex items-center justify-center rounded-full font-bold text-white transition-all',
              prominent
                ? 'w-11 h-11 text-2xl bg-primary/80 shadow-lg'
                : 'absolute top-1 left-1 w-6 h-6 text-xs bg-primary/70',
            )}
          >
            {number}
          </span>
        </button>
      );
    });
  };

  return (
    <div className="relative h-full w-full flex flex-col p-2">
      <p className="gradient-text text-center text-[16px] leading-5 tracking[1.33px] mb-3">
        {armedPhoto ? 'Tap a slot to place your photo' : 'Preview'}
      </p>

      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center min-h-0"
      >
        {!selectedFrame && (
          <div
            className="border-4 border-dashed border-[#3F72AF]/30 rounded-2xl bg-transparent flex items-center justify-center"
            style={{
              aspectRatio: '464/696',
              width: '380px',
              maxHeight: '100%',
            }}
          >
            <p className="gradient-text text-center text-[16px] leading-5">
              Add Frame First
            </p>
          </div>
        )}

        <div
          className="relative"
          style={{
            width: CANVAS_W * scale,
            height: CANVAS_H * scale,
            display: selectedFrame ? 'block' : 'none',
          }}
        >
          <div
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <canvas ref={canvasRef} />
          </div>
          {renderSlotOverlays()}
        </div>
      </div>
    </div>
  );
}
