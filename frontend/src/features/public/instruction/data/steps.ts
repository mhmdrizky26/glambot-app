import { type LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  RotateCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  CircleStop,
  Hand,
} from 'lucide-react';

export interface ActivityItem {
  label: string;
}

export interface RuleItem {
  text: string;
}

export interface GestureItem {
  name: string;
  fingers: string;
  icon?: LucideIcon;
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
    sessionDuration: 8,
    activities: [
      { label: 'Strike a pose' },
      { label: 'Use gestures' },
      { label: 'Camera moves' },
    ],
  },
  {
    id: 2,
    type: 'safety',
    heading: 'Safety & Rules',
    doRules: [
      { text: 'Stay 3m away from the robot' },
      { text: 'Stay in detection area' },
      { text: 'Use clear hand gestures' },
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
      { name: 'Move Up', fingers: 'Index', icon: ArrowUp },
      { name: 'Move Forward', fingers: 'Index + Middle', icon: ZoomIn },
      {
        name: 'Move Right',
        fingers: 'Index + Middle + Ring',
        icon: ArrowRight,
      },
      {
        name: 'Move Down',
        fingers: 'Index + Middle + Ring + Pinky',
        icon: ArrowDown,
      },
      { name: 'Stop', fingers: 'Open hand', icon: Hand },
      { name: 'Move Left', fingers: 'Thumb', icon: ArrowLeft },
      { name: 'Move Backward', fingers: 'Thumb + Index', icon: ZoomOut },
      { name: 'Rotate CW', fingers: 'Thumb + Index + Middle', icon: RotateCw },
      {
        name: 'Rotate CCW',
        fingers: 'Thumb + Index + Middle + Ring',
        icon: RotateCcw,
      },
      { name: 'Stop', fingers: 'Fist (No finger)', icon: CircleStop },
    ],
  },
];
