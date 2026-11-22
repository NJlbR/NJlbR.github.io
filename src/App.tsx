import { useState, lazy, Suspense, useCallback, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Header } from './components/Header';
import { MainFeed } from './pages/MainFeed';
import { AnnotationPopup } from './components/AnnotationPopup';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase } from './lib/supabase';

const AuthPage = lazy(() => import('./pages/AuthPage').then(m => ({ default: m.AuthPage })));
const MessagesPage = lazy(() => import('./pages/MessagesPage').then(m => ({ default: m.MessagesPage })));
const GroupsPage = lazy(() => import('./pages/GroupsPage').then(m => ({ default: m.GroupsPage })));
const ChannelsPage = lazy(() => import('./pages/ChannelsPage').then(m => ({ default: m.ChannelsPage })));
const AnnotationsGraph = lazy(() => import('./pages/AnnotationsGraph').then(m => ({ default: m.AnnotationsGraph })));

type Page = 'feed' | 'graph' | 'auth' | 'messages' | 'channels' | 'groups';

function PageFallback() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 animate-pulse">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4"></div>
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    </div>
  );
}

function AppContent() {
  const { profile } = useAuth();
  const getInitialStateFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      group: params.get('group'),
      channel: params.get('channel'),
      page: params.get('page'),
    };
  };
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const { channel, group, page } = getInitialStateFromUrl();
    if (channel) return 'channels';
    if (group) return 'groups';
    if (page === 'auth' || page === 'messages' || page === 'channels' || page === 'groups' || page === 'graph') {
      return page;
    }
    return 'feed';
  });
  const [groupInviteCode, setGroupInviteCode] = useState<string | null>(() => getInitialStateFromUrl().group);
  const [channelInviteCode, setChannelInviteCode] = useState<string | null>(() => getInitialStateFromUrl().channel);
  const [randomAnnotationId, setRandomAnnotationId] = useState<string | null>(null);

  const navigateTo = useCallback((page: Page) => {
    setCurrentPage(page);
    const url = new URL(window.location.href);
    if (page === 'feed') {
      url.searchParams.delete('page');
    } else {
      url.searchParams.set('page', page);
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleRandomAnnotation = useCallback(async () => {
    const { data } = await supabase
      .from('annotations')
      .select('id')
      .limit(100);

    if (data && data.length > 0) {
      const randomIndex = Math.floor(Math.random() * data.length);
      setRandomAnnotationId(data[randomIndex].id);
    }
  }, []);

  const handleNavigateGraph = useCallback(() => navigateTo('graph'), [navigateTo]);
  const handleNavigateHome = useCallback(() => navigateTo('feed'), [navigateTo]);
  const handleNavigateAuth = useCallback(() => navigateTo('auth'), [navigateTo]);
  const handleNavigateMessages = useCallback(() => navigateTo('messages'), [navigateTo]);
  const handleNavigateChannels = useCallback(() => navigateTo('channels'), [navigateTo]);
  const handleNavigateGroups = useCallback(() => navigateTo('groups'), [navigateTo]);

  useEffect(() => {
    const handleLocationChange = () => {
      const { group, channel, page } = getInitialStateFromUrl();
      setGroupInviteCode(group);
      setChannelInviteCode(channel);

      if (channel) {
        setCurrentPage('channels');
        return;
      }

      if (group) {
        setCurrentPage('groups');
        return;
      }

      if (page === 'auth' || page === 'messages' || page === 'channels' || page === 'groups' || page === 'graph') {
        setCurrentPage(page);
      } else {
        setCurrentPage('feed');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  if (currentPage === 'auth') {
    return (
      <Suspense fallback={<PageFallback />}>
        <AuthPage
          onAuthSuccess={() => navigateTo('feed')}
          onBack={() => navigateTo('feed')}
        />
      </Suspense>
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
          <Suspense fallback={<PageFallback />}>
            <MessagesPage onNavigateAuth={handleNavigateAuth} />
          </Suspense>
        )}
        {currentPage === 'channels' && (
          <Suspense fallback={<PageFallback />}>
            <ChannelsPage
              onNavigateAuth={handleNavigateAuth}
              initialInviteCode={channelInviteCode}
            />
          </Suspense>
        )}
        {currentPage === 'groups' && (
          <Suspense fallback={<PageFallback />}>
            <GroupsPage
              onNavigateAuth={handleNavigateAuth}
              initialInviteCode={groupInviteCode}
            />
          </Suspense>
        )}
        {currentPage === 'graph' && (
          <Suspense fallback={<PageFallback />}>
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
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
