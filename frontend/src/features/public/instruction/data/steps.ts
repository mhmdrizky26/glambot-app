export interface ActivityItem {
  label: string;
  description?: string;
}

export interface RuleItem {
  text: string;
  // Kunci ikon (dipetakan ke komponen lucide di InstructionCards).
  icon?: string;
}

export interface GestureItem {
  name: string;
  fingers: string;
  icon?: string; // Path to SVG icon
}

/**
 * Bagian kartu yang disorot mengikuti narasi yang sedang berbunyi
 * (rangkaian cue-nya ada di InstructionPage → STEP_CUES).
 */
export type InstructionHighlight =
  | 'duration'
  | 'activities'
  | 'guideline'
  | 'gestures'
  | 'camera';

export interface InstructionStep {
  id: number;
  type: 'get-ready' | 'safety' | 'gesture-controls';
  heading: string;
  subheading?: string;
  sessionDuration?: number;
  activities?: ActivityItem[];
  doRules?: RuleItem[];
  dontRules?: RuleItem[];
  guideline?: string;
  gestures?: GestureItem[];
}

export const instructionSteps: InstructionStep[] = [
  {
    id: 1,
    type: 'get-ready',
    heading: 'Siap-Siap!',
    sessionDuration: 5,
    activities: [
      { label: 'Pakai gerakan tangan' },
      { label: 'Kamera bergerak' },
      { label: 'Mulai bergaya' },
    ],
  },
  {
    id: 2,
    type: 'safety',
    heading: 'Keselamatan & Aturan',
    doRules: [
      { text: 'Jaga jarak 2m dari robot', icon: 'ruler' },
      { text: 'Tetap di area deteksi', icon: 'zone' },
      { text: 'Pakai gerakan tangan yang jelas', icon: 'hand' },
      { text: 'Have fun dan berkreasi!', icon: 'fun' },
    ],
    dontRules: [
      { text: 'Jangan terlalu dekat', icon: 'close' },
      { text: 'Jangan sentuh robot', icon: 'touch' },
      { text: 'Jangan halangi sensor', icon: 'sensor' },
      { text: 'Jangan bawa makanan atau minuman', icon: 'food' },
    ],
    guideline:
      'Cukup satu tangan dari satu orang dalam satu waktu',
  },
  {
    id: 3,
    type: 'gesture-controls',
    heading: 'Kontrol Gerakan Tangan',
    subheading: 'Pakai gerakan tangan ini untuk mengendalikan kamera',
    gestures: [
      // CATATAN: `icon` adalah path file SVG asli — jangan ikut diterjemahkan.
      // GestureControlsGrid juga mencocokkan string 'MOVELEFT' dari path ini.
      { name: 'Geser Atas', fingers: 'Telunjuk', icon: '/finger/MOVE UP.svg' },
      {
        name: 'Maju',
        fingers: 'Telunjuk + Tengah',
        icon: '/finger/FORWARD.svg',
      },
      {
        name: 'Geser Kanan',
        fingers: 'Telunjuk + Tengah + Manis',
        icon: '/finger/RIGHT.svg',
      },
      {
        name: 'Geser Bawah',
        fingers: 'Telunjuk + Tengah + Manis + Kelingking',
        icon: '/finger/DOWN.svg',
      },
      { name: 'Berhenti', fingers: 'Telapak terbuka', icon: '/finger/STOP.svg' },
      { name: 'Geser Kiri', fingers: 'Jempol', icon: '/finger/MOVELEFT.svg' },
      {
        name: 'Mundur',
        fingers: 'Jempol + Telunjuk',
        icon: '/finger/BACKWARD.svg',
      },
      {
        name: 'Putar Kanan',
        fingers: 'Jempol + Telunjuk + Tengah',
        icon: '/finger/ROTATECW.svg',
      },
      {
        name: 'Putar Kiri',
        fingers: 'Jempol + Telunjuk + Tengah + Manis',
        icon: '/finger/ROTATECCW.svg',
      },
      { name: 'Berhenti', fingers: 'Kepalan (tanpa jari)', icon: '/finger/STOP2.svg' },
    ],
  },
];
