import { packageHandlers } from './package';
import { paymentHandlers } from './payment';
import { sessionHandlers } from './session';

export const handlers = [
  ...packageHandlers,
  ...paymentHandlers,
  ...sessionHandlers,
];
