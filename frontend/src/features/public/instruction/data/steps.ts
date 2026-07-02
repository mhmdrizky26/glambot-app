export interface ActivityItem {
  label: string;
}

export interface RuleItem {
  text: string;
}

export interface GestureItem {
  name: string;
  fingers: string;
  icon?: string; // Path to SVG icon
}

export interface InstructionStep {
  id: number;
  type: 'get-ready' | 'safety' | 'gesture-controls';
  heading: string;
  subheading?: string;
  sessionDuration?: number;
  activities?: ActivityItem[];
  doRules?: RuleItem[];
  dontRules?: RuleItem[];
  gestures?: GestureItem[];
}

export const instructionSteps: InstructionStep[] = [
  {
    id: 1,
    type: 'get-ready',
    heading: 'Get Ready!',
    subheading: 'Your session lasts',
    sessionDuration: 5,
    activities: [
      { label: 'Use gestures' },
      { label: 'Strike a pose' },
      { label: 'Camera moves' },
    ],
  },
  {
    id: 2,
    type: 'safety',
    heading: 'Safety & Rules',
    doRules: [
      { text: 'Stay 2m away from the robot' },
      { text: 'Stay in detection area' },
      { text: 'Use clear hand gestures' },
      { text: 'Have fun and be creative!' },
    ],
    dontRules: [
      { text: 'Don’t get too close' },
      { text: 'Don’t touch the robot' },
      { text: 'Don’t block the sensor' },
      { text: 'No food or drinks nearby' },
    ],
  },
  {
    id: 3,
    type: 'gesture-controls',
    heading: 'Gesture Controls',
    subheading: 'Use these hand gestures to control the camera',
    gestures: [
      { name: 'Move Up', fingers: 'Index', icon: '/finger/MOVE UP.svg' },
      {
        name: 'Move Forward',
        fingers: 'Index + Middle',
        icon: '/finger/FORWARD.svg',
      },
      {
        name: 'Move Right',
        fingers: 'Index + Middle + Ring',
        icon: '/finger/RIGHT.svg',
      },
      {
        name: 'Move Down',
        fingers: 'Index + Middle + Ring + Pinky',
        icon: '/finger/DOWN.svg',
      },
      { name: 'Stop', fingers: 'Open hand', icon: '/finger/STOP.svg' },
      { name: 'Move Left', fingers: 'Thumb', icon: '/finger/MOVELEFT.svg' },
      {
        name: 'Move Backward',
        fingers: 'Thumb + Index',
        icon: '/finger/BACKWARD.svg',
      },
      {
        name: 'Rotate CW',
        fingers: 'Thumb + Index + Middle',
        icon: '/finger/ROTATECW.svg',
      },
      {
        name: 'Rotate CCW',
        fingers: 'Thumb + Index + Middle + Ring',
        icon: '/finger/ROTATECCW.svg',
      },
      { name: 'Stop', fingers: 'Fist (No finger)', icon: '/finger/STOP2.svg' },
    ],
  },
];
