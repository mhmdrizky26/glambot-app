export type PhotoSessionMessage =
  | { type: 'SESSION_START'; sessionId: string }
  | { type: 'SESSION_END'; sessionId: string };

const CHANNEL_NAME = 'photo-session';

export function sendSessionBroadcast(message: PhotoSessionMessage) {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(message);
  channel.close();
}

export function listenSessionBroadcast(handlers: {
  onStart?: (sessionId: string) => void;
  onEnd?: (sessionId: string) => void;
}) {
  const channel = new BroadcastChannel(CHANNEL_NAME);

  channel.onmessage = (event: MessageEvent<PhotoSessionMessage>) => {
    const msg = event.data;
    if (msg.type === 'SESSION_START') handlers.onStart?.(msg.sessionId);
    if (msg.type === 'SESSION_END') handlers.onEnd?.(msg.sessionId);
  };

  return () => channel.close();
}
