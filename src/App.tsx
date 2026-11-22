import {
  Component,
  ErrorInfo,
  ReactNode,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Header } from './components/Header';
import { MainFeed } from './pages/MainFeed';
import { AuthPage } from './pages/AuthPage';
import { MessagesPage } from './pages/MessagesPage';
import { GroupsPage } from './pages/GroupsPage';
import { ChannelsPage } from './pages/ChannelsPage';
import { AnnotationPopup } from './components/AnnotationPopup';
import { isSupabaseConfigured } from './lib/supabase';
import {
  fetchAllSupabaseAnnotations,
  mergeAnnotationsWithCatalog,
} from './utils/annotationsCatalog';

const AnnotationsGraph = lazy(() =>
  import('./pages/AnnotationsGraph').then((m) => ({ default: m.AnnotationsGraph }))
);

type Page = 'feed' | 'graph' | 'auth' | 'messages' | 'channels' | 'groups';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Непредвиденная ошибка приложения',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 text-center space-y-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Произошла ошибка при отображении страницы
            </h1>
            <p className="text-sm text-red-600 dark:text-red-400 break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
            >
              Обновить страницу
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppContent() {
  const { profile } = useAuth();
  const getInviteCodesFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      group: params.get('group'),
      channel: params.get('channel'),
    };
  };
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const { channel, group } = getInviteCodesFromUrl();
    if (channel) return 'channels';
    if (group) return 'groups';
    return 'feed';
  });
  const [groupInviteCode, setGroupInviteCode] = useState<string | null>(
    () => getInviteCodesFromUrl().group
  );
  const [channelInviteCode, setChannelInviteCode] = useState<string | null>(
    () => getInviteCodesFromUrl().channel
  );
  const [randomAnnotationId, setRandomAnnotationId] = useState<string | null>(null);

  const handleRandomAnnotation = useCallback(async () => {
    let dbAnnotations: { id: string; term: string }[] = [];

    if (isSupabaseConfigured) {
      const { data } = await fetchAllSupabaseAnnotations<{ id: string; term: string }>('id, term');
      dbAnnotations = data;
    }

    const pool = mergeAnnotationsWithCatalog(dbAnnotations);
    if (pool.length > 0) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      setRandomAnnotationId(pool[randomIndex].id);
    }
  }, []);

  const handleNavigateGraph = useCallback(() => setCurrentPage('graph'), []);
  const handleNavigateHome = useCallback(() => setCurrentPage('feed'), []);
  const handleNavigateAuth = useCallback(() => setCurrentPage('auth'), []);
  const handleNavigateMessages = useCallback(() => setCurrentPage('messages'), []);
  const handleNavigateChannels = useCallback(() => setCurrentPage('channels'), []);
  const handleNavigateGroups = useCallback(() => setCurrentPage('groups'), []);

  useEffect(() => {
    const handleLocationChange = () => {
      const { group, channel } = getInviteCodesFromUrl();
      setGroupInviteCode(group);
      setChannelInviteCode(channel);

      if (channel) {
        setCurrentPage('channels');
        return;
      }

      if (group) {
        setCurrentPage('groups');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  if (currentPage === 'auth') {
    return (
      <AuthPage
        onAuthSuccess={() => setCurrentPage('feed')}
        onBack={() => setCurrentPage('feed')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <Header
        onRandomAnnotation={handleRandomAnnotation}
        onNavigateGraph={handleNavigateGraph}
        onNavigateHome={handleNavigateHome}
        onNavigateAuth={handleNavigateAuth}
        onNavigateMessages={handleNavigateMessages}
        onNavigateChannels={handleNavigateChannels}
        onNavigateGroups={handleNavigateGroups}
        currentPage={currentPage}
      />

      {!isSupabaseConfigured && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 text-center text-sm text-amber-800 dark:text-amber-200">
            Не настроены переменные окружения Supabase (VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY).
          </div>
        </div>
      )}

      {profile?.is_admin && (
        <div className="bg-green-600 border-b border-green-700">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2">
            <a
              href="./admin.html"
              className="flex items-center justify-center gap-2 text-white hover:text-green-100 transition-colors font-medium"
            >
              Админ-панель
            </a>
          </div>
        </div>
      )}

      <main>
        {currentPage === 'feed' && <MainFeed />}
        {currentPage === 'messages' && (
          <MessagesPage onNavigateAuth={handleNavigateAuth} />
        )}
        {currentPage === 'channels' && (
          <ChannelsPage
            onNavigateAuth={handleNavigateAuth}
            initialInviteCode={channelInviteCode}
          />
        )}
        {currentPage === 'groups' && (
          <GroupsPage
            onNavigateAuth={handleNavigateAuth}
            initialInviteCode={groupInviteCode}
          />
        )}
        {currentPage === 'graph' && (
          <Suspense
            fallback={
              <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 animate-pulse">
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4"></div>
                  <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
              </div>
            }
          >
            <AnnotationsGraph />
          </Suspense>
        )}
      </main>

      {randomAnnotationId && (
        <AnnotationPopup
          annotationId={randomAnnotationId}
          onClose={() => setRandomAnnotationId(null)}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}

export default App;
