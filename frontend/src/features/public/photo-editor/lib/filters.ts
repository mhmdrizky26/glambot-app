import { fabric } from 'fabric';
import { Image as FabricImage } from 'fabric/fabric-impl';

// Definisi KANONIK FilterType. Modul lain (mis. PhotoEditorPage) me-re-export
// dari sini agar tidak ada dua definisi yang bisa drift.
export type FilterType =
  | 'original'
  | 'warm'
  | 'cool'
  | 'vintage'
  | 'dramatic'
  | 'mono'
  | 'sepia'
  | 'vivid'
  | 'soft'
  | 'film';

/**
 * Get Fabric.js filter array for given filter type.
 * Each case returns an array of Fabric image filters applied left-to-right.
 */
export const getFiltersByType = (filterType: FilterType): any[] => {
  switch (filterType) {
    case 'original':
      return [];

    case 'warm':
      return [
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            1.1, 0, 0, 0, 0.05, // boost red
            0, 1.0, 0, 0, 0.03, // slight green
            0, 0, 0.9, 0, 0,    // reduce blue
            0, 0, 0, 1, 0,
          ],
        }),
      ];

    case 'cool':
      return [
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            0.9, 0, 0, 0, 0,    // reduce red
            0, 1.0, 0, 0, 0.02, // slight green
            0, 0, 1.1, 0, 0.05, // boost blue
            0, 0, 0, 1, 0,
          ],
        }),
      ];

    case 'vintage':
      return [
        new fabric.Image.filters.Sepia(),
        new fabric.Image.filters.Brightness({ brightness: 0.05 }),
        new fabric.Image.filters.Contrast({ contrast: -0.1 }),
      ];

    case 'dramatic':
      return [
        new fabric.Image.filters.Contrast({ contrast: 0.3 }),
        new fabric.Image.filters.Saturation({ saturation: 0.4 }),
      ];

    case 'mono':
      return [
        new fabric.Image.filters.Grayscale(),
        new fabric.Image.filters.Contrast({ contrast: 0.12 }),
      ];

    case 'sepia':
      return [
        new fabric.Image.filters.Sepia(),
        new fabric.Image.filters.Contrast({ contrast: 0.05 }),
      ];

    case 'vivid':
      return [
        new fabric.Image.filters.Saturation({ saturation: 0.5 }),
        new fabric.Image.filters.Contrast({ contrast: 0.12 }),
      ];

    case 'soft':
      return [
        new fabric.Image.filters.Saturation({ saturation: -0.15 }),
        new fabric.Image.filters.Contrast({ contrast: -0.12 }),
        new fabric.Image.filters.Brightness({ brightness: 0.06 }),
      ];

    case 'film':
      return [
        new fabric.Image.filters.Saturation({ saturation: -0.1 }),
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            1.05, 0, 0, 0, 0.03,
            0, 1.0, 0, 0, 0.02,
            0, 0, 0.92, 0, 0,
            0, 0, 0, 1, 0,
          ],
        }),
        new fabric.Image.filters.Noise({ noise: 25 }),
      ];

    default:
      return [];
  }
};

/**
 * Apply filter to a single Fabric.js image
 */
export const applyFilterToImage = (
  image: FabricImage,
  filterType: FilterType,
): void => {
  const filters = getFiltersByType(filterType);
  image.filters = filters;
  image.applyFilters();
};

/**
 * Apply filter to all photos in composition
 */
export const applyFilterToComposition = (
  canvas: fabric.Canvas,
  filterType: FilterType,
): void => {
  const objects = canvas.getObjects();

  objects.forEach((obj) => {
    if (obj.type === 'image' && (obj as any).data?.isPhoto) {
      applyFilterToImage(obj as FabricImage, filterType);
    }
  });

  canvas.renderAll();
};
