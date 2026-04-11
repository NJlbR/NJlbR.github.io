import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ConversationsList } from '../components/messages/ConversationsList';
import { ChatWindow } from '../components/messages/ChatWindow';
import { UserSearch } from '../components/messages/UserSearch';
import { LogIn, Lock } from 'lucide-react';

interface MessagesPageProps {
  onNavigateAuth: () => void;
}

export function MessagesPage({ onNavigateAuth }: MessagesPageProps) {
  const { user, profile } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showUserSearch, setShowUserSearch] = useState(false);

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-73px)] flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn size={32} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Войдите в аккаунт
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Для доступа к личным сообщениям необходимо войти в систему
          </p>
          <button
            type="button"
            onClick={onNavigateAuth}
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            Перейти к входу
          </button>
        </div>
      </div>
    );
  }

  if (!profile || profile.approval_status !== 'approved') {
    return (
      <div className="min-h-[calc(100vh-73px)] flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={32} className="text-yellow-600 dark:text-yellow-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Требуется одобрение
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            Ваша учетная запись ожидает одобрения администратором.
          </p>
          <p className="text-gray-600 dark:text-gray-400">
            После одобрения вы получите доступ к личным сообщениям.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-73px)] flex bg-gray-50 dark:bg-gray-900">
      <div className="w-full md:w-96 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        <ConversationsList
          onSelectConversation={setSelectedConversationId}
          selectedConversationId={selectedConversationId}
          onNewMessage={() => setShowUserSearch(true)}
        />
      </div>

      <div className="flex-1 flex flex-col">
        {selectedConversationId ? (
          <ChatWindow
            conversationId={selectedConversationId}
            onBack={() => setSelectedConversationId(null)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <div className="text-6xl mb-4">💬</div>
              <p className="text-lg font-medium mb-2">Выберите диалог</p>
              <p className="text-sm">или начните новый разговор</p>
            </div>
          </div>
        )}
      </div>

      {showUserSearch && (
        <UserSearch
          onClose={() => setShowUserSearch(false)}
          onSelectUser={(conversationId) => {
            setSelectedConversationId(conversationId);
            setShowUserSearch(false);
          }}
        />
      )}
    </div>
  );
}
