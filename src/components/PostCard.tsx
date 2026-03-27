import { useState, useMemo, memo } from 'react';
import { Calendar, Hash, User, ChevronDown, ChevronUp, FileText, Image as ImageIcon } from 'lucide-react';
import { AnnotationPopup } from './AnnotationPopup';
import { MediaContent } from './MediaContent';
import { CommentsSection } from './CommentsSection';
import { detectAnnotations, AnnotationMatch } from '../utils/annotationDetection';
import type { Database } from '../lib/database.types';

type Post = Database['public']['Tables']['posts']['Row'];

interface PostWithRelations extends Post {
  hashtags?: { name: string }[];
  persons?: { name: string }[];
  post_annotations?: any[];
}

interface PostCardProps {
  post: PostWithRelations;
  allAnnotations?: { id: string; term: string }[];
}

function PostCardContent({ post, allAnnotations = [] }: PostCardProps) {
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [showDescription, setShowDescription] = useState(false);

  const contentTypes = post.content_types || [post.content_type];
  const mediaUrls = post.media_urls ? (typeof post.media_urls === 'string' ? JSON.parse(post.media_urls) : post.media_urls) : [];

  const annotatedContent = useMemo(() => {
    if (!contentTypes.includes('text') || !post.content) return [];
    const matches = detectAnnotations(post.content, allAnnotations);
    return renderAnnotatedText(post.content, matches, setSelectedAnnotationId);
  }, [post.content, allAnnotations, contentTypes]);

  const annotatedDescription = useMemo(() => {
    if (!post.description) return [];
    const matches = detectAnnotations(post.description, allAnnotations);
    return renderAnnotatedText(post.description, matches, setSelectedAnnotationId);
  }, [post.description, allAnnotations]);

  function renderAnnotatedText(
    text: string,
    matches: AnnotationMatch[],
    onSelectAnnotation: (id: string) => void
  ): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((match, idx) => {
      if (lastIndex < match.start) {
        parts.push(text.slice(lastIndex, match.start));
      }

      const annotatedText = text.slice(match.start, match.end);
      parts.push(
        <button
          key={`annotation-${idx}`}
          onClick={() => onSelectAnnotation(match.annotationId)}
          className="annotation-highlight bg-yellow-200 dark:bg-yellow-600 hover:bg-yellow-300 dark:hover:bg-yellow-500 cursor-pointer rounded px-1 transition-colors"
        >
          {annotatedText}
        </button>
      );

      lastIndex = match.end;
    });

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6 mb-4 sm:mb-6 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mr-3">
          {post.title}
        </h2>
        <div className="flex gap-2 flex-shrink-0">
          {contentTypes.map(type => {
            switch (type) {
              case 'text': return <FileText key="text" className="text-blue-500" size={20} />;
              case 'photo': return <ImageIcon key="photo" className="text-green-500" size={20} />;
              default: return null;
            }
          }).filter(Boolean)}
        </div>
      </div>

      {contentTypes.includes('text') && post.content && (
        <div className="prose dark:prose-invert max-w-none mb-4">
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
            {annotatedContent}
          </p>
        </div>
      )}

      {mediaUrls.length > 0 && (
        <div className="mb-4">
          <MediaContent mediaUrls={mediaUrls} />
        </div>
      )}

      {post.has_description && post.description && (
        <div className="mt-4">
          <button
            onClick={() => setShowDescription(!showDescription)}
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-2"
          >
            {showDescription ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            <span className="font-medium">Описание</span>
          </button>

          {showDescription && (
            <div className="prose dark:prose-invert max-w-none mt-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {annotatedDescription}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-4">
        <div className="flex items-center gap-1">
          <Calendar size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
          <span>{new Date(post.created_at).toLocaleDateString('ru-RU')}</span>
        </div>

        {post.hashtags && post.hashtags.length > 0 && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Hash size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
            {post.hashtags.map((tag, idx) => (
              <span
                key={idx}
                className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 sm:py-1 rounded-full text-xs"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}

        {post.persons && post.persons.length > 0 && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <User size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
            {post.persons.map((person, idx) => (
              <span
                key={idx}
                className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 sm:py-1 rounded-full text-xs"
              >
                {person.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {post.allow_comments && (
        <CommentsSection postId={post.id} />
      )}

      {selectedAnnotationId && (
        <AnnotationPopup
          annotationId={selectedAnnotationId}
          onClose={() => setSelectedAnnotationId(null)}
        />
      )}
    </div>
  );
}

export const PostCard = memo(PostCardContent);
