import { frameHandlers } from './frame';
import { packageHandlers } from './package';
import { paymentHandlers } from './payment';
import { photoHandlers } from './photo';
import { robotHandlers } from './robot';
import { sessionHandlers } from './session';

export const handlers = [
  ...packageHandlers,
  ...paymentHandlers,
  ...sessionHandlers,
  ...photoHandlers,
  ...frameHandlers,
  ...robotHandlers,
];
