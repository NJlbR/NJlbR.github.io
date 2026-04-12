import { useState } from 'react';
import { Users, Settings, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import type { Database } from '../../lib/database.types';

type Channel = Database['public']['Tables']['channels']['Row'] & {
  subscriber_count?: number;
  is_subscribed?: boolean;
  is_owner?: boolean;
  is_private?: boolean | null;
  access_code?: string | null;
};

interface ChannelListProps {
  channels: Channel[];
  onChannelCreated: () => void;
  onPreviewChannel: (params: { channelId?: string | null; inviteCode?: string | null }) => void;
  onJoinByCode: () => void;
}

export function ChannelList({ channels, onChannelCreated, onPreviewChannel, onJoinByCode }: ChannelListProps) {
  const { user } = useAuth();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  async function handleToggleSubscription(channelId: string) {
    if (!user || subscribing) return;

    setSubscribing(channelId);

    try {
      const { data, error } = await supabase.rpc('toggle_channel_subscription', {
        channel_id_param: channelId,
      } as any);

      if (error) throw error;

      onChannelCreated();
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    } finally {
      setSubscribing(null);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {channels.map((channel) => {
        const isOwner = user?.id === channel.created_by;
        const isSubscribed = channel.is_subscribed;
        const isPrivate = !!channel.is_private;

        return (
          <div
            key={channel.id}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 transition-all cursor-pointer"
            onClick={() => {
              if (isOwner) {
                setSelectedChannelId(channel.id);
                return;
              }

              if (isPrivate && !isSubscribed) {
                onPreviewChannel({ channelId: channel.id, inviteCode: channel.access_code || null });
              }
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {channel.name[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                    {channel.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {channel.username ? `@${channel.username}` : 'Канал по коду'}
                  </p>
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {isPrivate ? <Lock size={12} /> : null}
                    {isPrivate ? 'Закрытый' : 'Открытый'}
                  </div>
                </div>
              </div>

              {isOwner && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedChannelId(channel.id);
                  }}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Настройки канала"
                >
                  <Settings size={20} />
                </button>
              )}
            </div>

            {channel.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                {channel.description}
              </p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Users size={16} />
                <span>{channel.subscriber_count || 0} подписчиков</span>
              </div>

              {isOwner ? (
                <a
                  href={`/channel/${channel.username}`}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  Управление
                </a>
              ) : (
                isPrivate && !isSubscribed ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onJoinByCode();
                    }}
                    className="px-4 py-2 rounded-lg transition-colors text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    По коду
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSubscription(channel.id);
                    }}
                    disabled={subscribing === channel.id}
                    className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 ${
                      isSubscribed
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {subscribing === channel.id
                      ? '...'
                      : isSubscribed
                      ? 'Отписаться'
                      : 'Подписаться'}
                  </button>
                )
              )}
            </div>
          </div>
        );
      })}

      {selectedChannelId && (
        <ChannelSettingsModal
          channelId={selectedChannelId}
          onClose={() => setSelectedChannelId(null)}
          onChannelUpdated={onChannelCreated}
        />
      )}
    </div>
  );
}
