import { fabric } from 'fabric';

/**
 * Transform helpers untuk foto di dalam slot (fitur adjust: zoom/rotate/move).
 *
 * Konsep: tiap foto punya `clipPath` dengan `absolutePositioned: true`, jadi clip
 * adalah jendela TETAP di ruang koordinat slot. Foto boleh di-scale/rotate/geser
 * di belakang jendela itu dan tetap terpotong rapi mengikuti bentuk slot.
 *
 * Data yang dipakai (di-set saat fitPhotoToSlot):
 * - data.slot           : { x, y, width, height, ... } geometri slot
 * - data.baseScale      : skala "cover" awal (batas zoom-out minimum)
 * - data.baseLeft/Top   : posisi tengah awal (untuk reset)
 * - data.originalWidth/Height : dimensi asli gambar (untuk hitung cover saat rotasi)
 */

const ROTATE_STEP_DEG = 15;
const ZOOM_STEP = 1.12;
/** Batas zoom-in relatif terhadap skala cover awal. */
const MAX_SCALE_RATIO = 4;

interface PhotoData {
  slot?: { x: number; y: number; width: number; height: number };
  baseScale?: number;
  baseLeft?: number;
  baseTop?: number;
  originalWidth?: number;
  originalHeight?: number;
}

const getData = (obj: fabric.Object): PhotoData =>
  (obj.data as PhotoData | undefined) ?? {};

/**
 * Skala minimum agar foto tetap menutupi slot pada sudut rotasi tertentu.
 *
 * Saat foto diputar θ, untuk menutupi persegi slot (w×h) foto (sebelum rotasi)
 * harus cukup besar menutupi bounding box slot yang "diputar balik":
 *   needW = w·|cosθ| + h·|sinθ|
 *   needH = w·|sinθ| + h·|cosθ|
 * Ini mencegah sudut slot bocor (putih) saat foto dirotasi.
 */
const minCoverScale = (obj: fabric.Object, angleDeg: number): number => {
  const d = getData(obj);
  const slot = d.slot;
  const ow = d.originalWidth ?? obj.width ?? 1;
  const oh = d.originalHeight ?? obj.height ?? 1;
  if (!slot) return d.baseScale ?? obj.scaleX ?? 1;

  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const needW = slot.width * c + slot.height * s;
  const needH = slot.width * s + slot.height * c;
  return Math.max(needW / ow, needH / oh);
};

/**
 * Geser foto seminimal mungkin agar bounding box-nya tetap menutupi slot.
 * Dipanggil saat user men-drag foto dan setelah zoom/rotate.
 */
export const clampPhotoToSlot = (obj: fabric.Object): void => {
  const slot = getData(obj).slot;
  if (!slot) return;

  obj.setCoords();
  // absolute=true: koordinat canvas apa adanya (tanpa viewport transform).
  const br = obj.getBoundingRect(true, true);

  let dx = 0;
  if (br.left > slot.x) dx = slot.x - br.left;
  else if (br.left + br.width < slot.x + slot.width)
    dx = slot.x + slot.width - (br.left + br.width);

  let dy = 0;
  if (br.top > slot.y) dy = slot.y - br.top;
  else if (br.top + br.height < slot.y + slot.height)
    dy = slot.y + slot.height - (br.top + br.height);

  if (dx !== 0 || dy !== 0) {
    obj.left = (obj.left ?? 0) + dx;
    obj.top = (obj.top ?? 0) + dy;
    obj.setCoords();
  }
};

/** Zoom foto aktif. dir > 0 = perbesar, dir < 0 = perkecil. */
export const zoomPhoto = (obj: fabric.Object, dir: 1 | -1): void => {
  const d = getData(obj);
  const base = d.baseScale ?? obj.scaleX ?? 1;
  const factor = dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

  // Batas bawah = skala cover untuk sudut saat ini (jangan biarkan slot bocor).
  const minScale = Math.max(base, minCoverScale(obj, obj.angle ?? 0));
  const maxScale = base * MAX_SCALE_RATIO;

  let next = (obj.scaleX ?? base) * factor;
  next = Math.max(minScale, Math.min(maxScale, next));
  obj.scale(next);
  clampPhotoToSlot(obj);
};

/** Putar foto aktif. dir = 1 (searah jarum jam) atau -1. */
export const rotatePhoto = (obj: fabric.Object, dir: 1 | -1): void => {
  const nextAngle = (obj.angle ?? 0) + dir * ROTATE_STEP_DEG;
  obj.rotate(nextAngle);

  // Pastikan skala masih menutupi slot pada sudut baru; kalau kurang, naikkan.
  const need = minCoverScale(obj, nextAngle);
  if ((obj.scaleX ?? 0) < need) obj.scale(need);

  clampPhotoToSlot(obj);
};

/** Kembalikan foto ke posisi/skala/rotasi cover awal. */
export const resetPhoto = (obj: fabric.Object): void => {
  const d = getData(obj);
  obj.set({
    scaleX: d.baseScale ?? obj.scaleX,
    scaleY: d.baseScale ?? obj.scaleY,
    angle: 0,
    left: d.baseLeft ?? obj.left,
    top: d.baseTop ?? obj.top,
  });
  obj.setCoords();
};
