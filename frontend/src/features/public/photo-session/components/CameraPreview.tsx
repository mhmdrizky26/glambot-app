import { RefObject } from 'react';

interface CameraPreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  className?: string;
}

export function CameraPreview({ videoRef, className }: CameraPreviewProps) {
  return (
    <div
      className={`h-full w-full relative rounded-3xl overflow-hidden bg-black/30 border-8 border-solid border-primary shadow-2xl ${className || ''}`}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover"
      />

      <div className="absolute top-5 left-5 w-8 h-8 border-t-2 border-l-2 border-white/50 rounded-tl-lg" />
      <div className="absolute top-5 right-5 w-8 h-8 border-t-2 border-r-2 border-white/50 rounded-tr-lg" />
      <div className="absolute bottom-5 left-5 w-8 h-8 border-b-2 border-l-2 border-white/50 rounded-bl-lg" />
      <div className="absolute bottom-5 right-5 w-8 h-8 border-b-2 border-r-2 border-white/50 rounded-br-lg" />
    </div>
  );
}
