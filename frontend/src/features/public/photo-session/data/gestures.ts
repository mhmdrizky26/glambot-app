interface SessionGesture {
  name: string;
  icon: string; // Path to SVG icon
  fingers: string; // Description of finger gesture
}

// CATATAN: `icon` adalah path file SVG asli — JANGAN diterjemahkan. Selain
// nama filenya memang begitu, GestureControlsGrid mencocokkan string
// 'MOVELEFT' dari path ini untuk memutar ikon jempol.
// Urutan array = urutan tampil di grid, jangan diubah.
export const Gestures: SessionGesture[] = [
  { name: 'Geser Atas', icon: '/finger/MOVE UP.svg', fingers: 'Telunjuk' },
  { name: 'Geser Kiri', icon: '/finger/MOVELEFT.svg', fingers: 'Jempol' },
  {
    name: 'Maju',
    icon: '/finger/FORWARD.svg',
    fingers: 'Telunjuk + Tengah',
  },
  {
    name: 'Mundur',
    icon: '/finger/BACKWARD.svg',
    fingers: 'Jempol + Telunjuk',
  },
  {
    name: 'Geser Kanan',
    icon: '/finger/RIGHT.svg',
    fingers: 'Telunjuk + Tengah + Manis',
  },
  {
    name: 'Putar Kanan',
    icon: '/finger/ROTATECW.svg',
    fingers: 'Jempol + Telunjuk + Tengah',
  },
  {
    name: 'Geser Bawah',
    icon: '/finger/DOWN.svg',
    fingers: 'Telunjuk + Tengah + Manis + Kelingking',
  },
  { name: 'Berhenti', icon: '/finger/STOP.svg', fingers: 'Telapak terbuka' },
  {
    name: 'Putar Kiri',
    icon: '/finger/ROTATECCW.svg',
    fingers: 'Jempol + Telunjuk + Tengah + Manis',
  },
  { name: 'Berhenti', icon: '/finger/STOP2.svg', fingers: 'Kepalan (tanpa jari)' },
];
