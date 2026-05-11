interface CameraPreviewProps {
  streamUrl: string | null;
  onError?: () => void;
  onRetry?: () => void;
  hasError?: boolean;
  className?: string;
}

export function CameraPreview({
  streamUrl,
  onError,
  onRetry,
  hasError = false,
  className,
}: CameraPreviewProps) {
  return (
    <div
      className={`h-full w-full relative rounded-3xl overflow-hidden bg-black/30 border-8 border-solid border-primary shadow-2xl ${className ?? ''}`}
    >
      {hasError || !streamUrl ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
          <p className="text-white/40 text-sm">Stream tidak tersedia</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-primary/60 underline hover:text-primary"
            >
              Coba lagi
            </button>
          )}
        </div>
      ) : (
        <img
          src={streamUrl}
          alt="Live camera stream"
          onError={onError}
          className="w-full h-full object-cover"
        />
      )}

      {/* Corner brackets */}
      <div className="absolute top-5 left-5 w-8 h-8 border-t-2 border-l-2 border-white/50 rounded-tl-lg pointer-events-none" />
      <div className="absolute top-5 right-5 w-8 h-8 border-t-2 border-r-2 border-white/50 rounded-tr-lg pointer-events-none" />
      <div className="absolute bottom-5 left-5 w-8 h-8 border-b-2 border-l-2 border-white/50 rounded-bl-lg pointer-events-none" />
      <div className="absolute bottom-5 right-5 w-8 h-8 border-b-2 border-r-2 border-white/50 rounded-br-lg pointer-events-none" />
    </div>
  );
}
