import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type Annotation = Database['public']['Tables']['annotations']['Row'];

interface AnnotationPopupProps {
  annotationId: string;
  onClose: () => void;
}

export function AnnotationPopup({ annotationId, onClose }: AnnotationPopupProps) {
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnnotation() {
      const { data } = await supabase
        .from('annotations')
        .select('*')
        .eq('id', annotationId)
        .maybeSingle();

      if (data) setAnnotation(data);
      setLoading(false);
    }

    fetchAnnotation();
  }, [annotationId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 max-w-2xl w-full">
          <div className="animate-pulse">
            <div className="h-6 sm:h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!annotation) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 max-w-2xl w-full max-h-[85vh] sm:max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mr-3">
            {annotation.term}
          </h2>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
          >
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="prose dark:prose-invert max-w-none">
          <div className="text-sm sm:text-base text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {annotation.content || 'Описание пока не добавлено.'}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Обновлено: {new Date(annotation.updated_at).toLocaleDateString('ru-RU')}
          </p>
        </div>
      </div>
    </div>
  );
}
