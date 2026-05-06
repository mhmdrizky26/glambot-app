import { fabric } from 'fabric';
import type { FrameSlot } from '../api/getFrames';

/**
 * Create a Fabric.js clipping path for the given slot shape.
 * absolutePositioned: true ensures clip path stays fixed on canvas
 */
export const createClipPath = (slot: FrameSlot): fabric.Object => {
  switch (slot.shape) {
    case 'rect':
      return new fabric.Rect({
        left: slot.x,
        top: slot.y,
        width: slot.width,
        height: slot.height,
        absolutePositioned: true,
      });

    case 'ellipse':
      return new fabric.Ellipse({
        left: slot.x + slot.width / 2,
        top: slot.y + slot.height / 2,
        rx: slot.width / 2,
        ry: slot.height / 2,
        originX: 'center',
        originY: 'center',
        absolutePositioned: true,
      });

    default:
      throw new Error(`Unknown shape type: ${slot.shape}`);
  }
};

/**
 * Fit a photo into a frame slot using "cover" strategy
 * (like CSS object-fit: cover).
 *
 * - Scales the photo to fully cover the slot with no white space
 * - Maintains aspect ratio (no distortion)
 * - Centers the photo in the slot
 * - Clips overflow with the slot's shape
 * - Limits upscaling to prevent pixelation
 *
 * Uses Fabric.js built-in `scaleToWidth/scaleToHeight` with
 * `originX/originY: 'center'` for reliable results.
 */
export const fitPhotoToSlot = async (
  photoUrl: string,
  slot: FrameSlot,
  canvas: fabric.Canvas,
  options: {
    /** Maximum upscale factor (default 2.0) */
    maxUpscale?: number;
  } = {},
): Promise<fabric.Image> => {
  const { maxUpscale = 2.0 } = options;

  return new Promise((resolve, reject) => {
    fabric.Image.fromURL(
      photoUrl,
      (img) => {
        if (!img || !img.width || !img.height) {
          reject(new Error(`Failed to load image: ${photoUrl}`));
          return;
        }

        try {
          const imgAspect = img.width / img.height;
          const slotAspect = slot.width / slot.height;

          console.log('[photoFitting] Calculating fit:', {
            slotId: slot.id,
            imgDimensions: { width: img.width, height: img.height },
            slotDimensions: { width: slot.width, height: slot.height },
            imgAspect: imgAspect.toFixed(2),
            slotAspect: slotAspect.toFixed(2),
          });

          // Calculate scale needed to COVER the slot (Math.max logic)
          let targetScale: number;
          if (imgAspect > slotAspect) {
            // Image is wider than slot → fit to HEIGHT (crop sides)
            targetScale = slot.height / img.height;
            console.log(
              '[photoFitting] Image wider than slot, fitting to HEIGHT:',
              {
                targetScale: targetScale.toFixed(3),
                resultWidth: (img.width * targetScale).toFixed(1),
                resultHeight: (img.height * targetScale).toFixed(1),
              },
            );
          } else {
            // Image is taller than slot → fit to WIDTH (crop top/bottom)
            targetScale = slot.width / img.width;
            console.log(
              '[photoFitting] Image taller than slot, fitting to WIDTH:',
              {
                targetScale: targetScale.toFixed(3),
                resultWidth: (img.width * targetScale).toFixed(1),
                resultHeight: (img.height * targetScale).toFixed(1),
              },
            );
          }

          // Prevent excessive upscaling to preserve quality
          if (targetScale > maxUpscale) {
            console.warn(
              `[photoFitting] Photo requires ${targetScale.toFixed(2)}x upscaling, capping at ${maxUpscale}x`,
            );
            targetScale = maxUpscale;
          }

          // Apply uniform scale
          img.scale(targetScale);

          console.log('[photoFitting] After scaling:', {
            scaleX: img.scaleX,
            scaleY: img.scaleY,
            scaledWidth: img.getScaledWidth(),
            scaledHeight: img.getScaledHeight(),
          });

          // Center in slot using originX/originY: 'center'
          // This is the KEY to proper centering — no manual offset calculation!
          img.set({
            left: slot.x + slot.width / 2,
            top: slot.y + slot.height / 2,
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false,
            data: {
              isPhoto: true,
              slotId: slot.id,
              photoUrl,
              originalWidth: img.width,
              originalHeight: img.height,
              appliedScale: targetScale,
            },
          });

          console.log('[photoFitting] Final position:', {
            left: img.left,
            top: img.top,
            originX: img.originX,
            originY: img.originY,
          });

          // Apply clipping path to hide overflow
          const clipPath = createClipPath(slot);
          img.clipPath = clipPath;

          canvas.add(img);
          canvas.renderAll();

          resolve(img);
        } catch (error) {
          reject(error);
        }
      },
      { crossOrigin: 'anonymous' },
    );
  });
};
