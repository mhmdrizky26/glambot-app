interface SessionGesture {
  name: string;
  icon: string; // Path to SVG icon
  fingers: string; // Description of finger gesture
}

export const Gestures: SessionGesture[] = [
  { name: 'Move Up', icon: '/finger/MOVE UP.svg', fingers: 'Index' },
  {
    name: 'Move Forward',
    icon: '/finger/FORWARD.svg',
    fingers: 'Index + Middle',
  },
  {
    name: 'Move Right',
    icon: '/finger/RIGHT.svg',
    fingers: 'Index + Middle + Ring',
  },
  {
    name: 'Move Down',
    icon: '/finger/DOWN.svg',
    fingers: 'Index + Middle + Ring + Pinky',
  },
  { name: 'Stop', icon: '/finger/STOP.svg', fingers: 'Open hand' },
  { name: 'Move Left', icon: '/finger/MOVELEFT.svg', fingers: 'Thumb' },
  {
    name: 'Move Backward',
    icon: '/finger/BACKWARD.svg',
    fingers: 'Thumb + Index',
  },
  {
    name: 'Rotate CW',
    icon: '/finger/ROTATECW.svg',
    fingers: 'Thumb + Index + Middle',
  },
  {
    name: 'Rotate CCW',
    icon: '/finger/ROTATECCW.svg',
    fingers: 'Thumb + Index + Middle + Ring',
  },
  { name: 'Stop', icon: '/finger/STOP2.svg', fingers: 'Fist (No finger)' },
];
