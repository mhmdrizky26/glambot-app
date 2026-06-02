import { z } from 'zod';

const slotSchema = z.object({
  shape: z.enum(['rect', 'circle', 'ellipse']),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  label: z.string(),
});

export const frameSchema = z.object({
  // Step 1: Image & Slots
  canvasWidth: z.number().min(1, 'Canvas width must be at least 1'),
  canvasHeight: z.number().min(1, 'Canvas height must be at least 1'),
  slots: z.array(slotSchema).min(1, 'Minimal 1 slot harus didefinisikan'),

  // Step 2: Details
  name: z
    .string()
    .min(1, 'Name Frame wajib diisi')
    .max(100, 'Name must be at most 100 characters'),
  category: z.string().min(1, 'Kategori wajib dipilih'),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional(),
  status: z.enum(['active', 'inactive']),
});

export type FrameFormData = z.infer<typeof frameSchema>;
