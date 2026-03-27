import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface FullscreenMediaProps {
  src: string;
  type: 'photo' | 'video';
  onClose: () => void;
}

export function FullscreenMedia({ src, type, onClose }: FullscreenMediaProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.5, 5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => {
      const newZoom = Math.max(prev - 0.5, 1);
      if (newZoom === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return newZoom;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (type === 'photo' && zoom > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && type === 'photo') {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent z-10">
        <div className="flex items-center gap-2">
          {type === 'photo' && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleZoomIn();
                }}
                className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
                title="Увеличить"
              >
                <ZoomIn size={24} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleZoomOut();
                }}
                className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
                title="Уменьшить"
              >
                <ZoomOut size={24} />
              </button>
              <span className="text-white text-sm ml-2">
                {Math.round(zoom * 100)}%
              </span>
            </>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
          title="Закрыть (Esc)"
        >
          <X size={24} />
        </button>
      </div>

      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {type === 'photo' ? (
          <img
            src={src}
            alt="Fullscreen view"
            className="max-w-full max-h-full object-contain"
            style={{
              transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
              cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              transition: isDragging ? 'none' : 'transform 0.2s',
            }}
            draggable={false}
          />
        ) : (
          <video
            src={src}
            controls
            autoPlay
            className="max-w-full max-h-full"
            style={{ maxHeight: '90vh' }}
          />
        )}
      </div>
    </div>
  );
}
