import { packageHandlers } from './package';
import { paymentHandlers } from './payment';

export const handlers = [...packageHandlers, ...paymentHandlers];
