import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, Paperclip, X, Image as ImageIcon, Music, Video, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { MessageBubble } from './MessageBubble';
import type { Database } from '../../lib/database.types';

type Message = Database['public']['Tables']['messages']['Row'];
type Conversation = Database['public']['Tables']['conversations']['Row'];

interface ChatWindowProps {
  conversationId: string;
  onBack: () => void;
}

interface MediaFile {
  file: File;
  type: 'photo' | 'audio' | 'video' | 'file';
  preview?: string;
}

export function ChatWindow({ conversationId, onBack }: ChatWindowProps) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUserProfile, setOtherUserProfile] = useState<any>(null);
  const [newMessage, setNewMessage] = useState('');
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (conversationId && user) {
      fetchConversation();
      fetchMessages();
      markMessagesAsRead();
      const cleanup = subscribeToMessages();
      return cleanup;
    }
  }, [conversationId, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function fetchConversation() {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();

    if (data) {
      const otherUserId = data.participant1_id === user?.id ? data.participant2_id : data.participant1_id;

      const { data: profileData } = await supabase
        .from('user_profiles')
        .select(profile?.is_admin ? 'id, username, is_admin, email' : 'id, username, is_admin')
        .eq('id', otherUserId)
        .maybeSingle();

      setOtherUserProfile(profileData);
    }
  }

  async function fetchMessages() {
    setLoading(true);

    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
    }

    setLoading(false);
  }

  async function markMessagesAsRead() {
    if (!user) return;

    await supabase.rpc('mark_messages_as_read', {
      conv_id: conversationId,
      reader_id: user.id,
    } as any);
  }

  function subscribeToMessages() {
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          if ((payload.new as Message).sender_id !== user?.id) {
            markMessagesAsRead();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => prev.filter(m => m.id !== (payload.old as any).id));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => prev.map(m => m.id === (payload.new as Message).id ? payload.new as Message : m));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      let type: 'photo' | 'audio' | 'video' | 'file' = 'file';

      if (file.type.startsWith('image/')) {
        type = 'photo';
        const reader = new FileReader();
        reader.onload = (e) => {
          setMediaFiles((prev) => [...prev, { file, type, preview: e.target?.result as string }]);
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('audio/')) {
        type = 'audio';
        setMediaFiles((prev) => [...prev, { file, type }]);
      } else if (file.type.startsWith('video/')) {
        type = 'video';
        setMediaFiles((prev) => [...prev, { file, type }]);
      } else {
        setMediaFiles((prev) => [...prev, { file, type }]);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeMediaFile = (index: number) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
  };

  async function uploadFile(file: File, type: string): Promise<string> {
    const fileExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${type}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('media-files')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('media-files')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();

    const trimmedMessage = newMessage.trim();

    if (!user || (!trimmedMessage && mediaFiles.length === 0)) return;

    setSending(true);

    try {
      const mediaUrls: any[] = [];

      for (const mediaFile of mediaFiles) {
        const url = await uploadFile(mediaFile.file, mediaFile.type);
        mediaUrls.push({
          type: mediaFile.type,
          url,
          filename: mediaFile.file.name,
        });
      }

      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: trimmedMessage || null,
          media_urls: mediaUrls.length > 0 ? mediaUrls : null,
        });

      if (error) throw error;

      setNewMessage('');
      setMediaFiles([]);
    } catch (err: any) {
      alert('Ошибка отправки: ' + err.message);
    } finally {
      setSending(false);
    }
  }

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'photo':
        return <ImageIcon size={20} />;
      case 'audio':
        return <Music size={20} />;
      case 'video':
        return <Video size={20} />;
      default:
        return <FileText size={20} />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      <div className="flex items-center gap-3 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <button
          onClick={onBack}
          className="md:hidden p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          <ArrowLeft size={20} />
        </button>

        {otherUserProfile && (
          <>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-base">
              {otherUserProfile.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base truncate">
                  {otherUserProfile.username}
                </h3>
                {otherUserProfile.is_admin && (
                  <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded flex-shrink-0">
                    admin
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-center">
            Начните разговор!
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.sender_id === user?.id}
              onDelete={() => setMessages(prev => prev.filter(m => m.id !== message.id))}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {mediaFiles.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex gap-2 overflow-x-auto">
            {mediaFiles.map((media, index) => (
              <div key={index} className="relative flex-shrink-0">
                {media.preview ? (
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-600">
                    <img src={media.preview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                    {getMediaIcon(media.type)}
                  </div>
                )}
                <button
                  onClick={() => removeMediaFile(index)}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="p-2 sm:p-3 md:p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-end gap-1.5 sm:gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept="image/*,audio/*,video/*,*/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
            title="Прикрепить файл"
          >
            <Paperclip size={20} className="sm:w-[22px] sm:h-[22px]" />
          </button>

          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            placeholder="Сообщение..."
            disabled={sending}
            rows={1}
            maxLength={10000}
            className="flex-1 px-3 sm:px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none disabled:opacity-50 text-sm sm:text-base"
            style={{ minHeight: '38px', maxHeight: '120px' }}
          />

          <button
            type="submit"
            disabled={(!newMessage.trim() && mediaFiles.length === 0) || sending}
            className="p-1.5 sm:p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed flex-shrink-0"
            title="Отправить"
          >
            <Send size={20} className="sm:w-[22px] sm:h-[22px]" />
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 px-1">
          {newMessage.length}/10000
        </p>
      </form>
    </div>
  );
}
