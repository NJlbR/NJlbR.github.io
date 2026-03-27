import { useState } from 'react';
import { Download, Maximize2 } from 'lucide-react';
import { MediaPlayer } from './MediaPlayer';
import { FullscreenMedia } from './FullscreenMedia';

interface MediaItem {
  type: string;
  url: string;
  filename?: string;
}

interface MediaContentProps {
  mediaUrls: MediaItem[];
}

export function MediaContent({ mediaUrls }: MediaContentProps) {
  const [fullscreenMedia, setFullscreenMedia] = useState<{ src: string; type: 'photo' | 'video' } | null>(null);

  if (!mediaUrls || mediaUrls.length === 0) {
    return null;
  }

  const handleDownload = async (url: string, filename?: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Не удалось скачать файл');
    }
  };

  return (
    <div className="space-y-4">
      {mediaUrls.map((item, index) => {
        if (item.type === 'photo') {
          return (
            <div key={index} className="relative group">
              <img
                src={item.url}
                alt={item.filename || 'Photo'}
                className="w-full rounded-lg cursor-pointer"
                onClick={() => setFullscreenMedia({ src: item.url, type: 'photo' })}
              />
              <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFullscreenMedia({ src: item.url, type: 'photo' });
                  }}
                  className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm"
                  title="Открыть на весь экран"
                >
                  <Maximize2 size={20} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(item.url, item.filename);
                  }}
                  className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm"
                  title="Скачать"
                >
                  <Download size={20} />
                </button>
              </div>
            </div>
          );
        }

        if (item.type === 'video') {
          return (
            <div key={index} className="relative">
              <MediaPlayer src={item.url} type="video" />
              <button
                onClick={() => setFullscreenMedia({ src: item.url, type: 'video' })}
                className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm"
                title="Открыть на весь экран"
              >
                <Maximize2 size={20} />
              </button>
            </div>
          );
        }

        if (item.type === 'audio') {
          return (
            <div key={index}>
              <MediaPlayer src={item.url} type="audio" />
            </div>
          );
        }

        if (item.type === 'file') {
          return (
            <div key={index}>
              <button
                onClick={() => handleDownload(item.url, item.filename)}
                className="w-full flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Download className="text-blue-600 dark:text-blue-400" size={24} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {item.filename || 'Файл для скачивания'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Нажмите для скачивания
                    </p>
                  </div>
                </div>
                <Download className="text-gray-400" size={20} />
              </button>
            </div>
          );
        }

        return null;
      })}

      {fullscreenMedia && (
        <FullscreenMedia
          src={fullscreenMedia.src}
          type={fullscreenMedia.type}
          onClose={() => setFullscreenMedia(null)}
        />
      )}
    </div>
  );
}
