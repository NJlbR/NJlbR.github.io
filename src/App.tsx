import { useState, lazy, Suspense, useCallback } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Header } from './components/Header';
import { MainFeed } from './pages/MainFeed';
import { AuthPage } from './pages/AuthPage';
import { AnnotationPopup } from './components/AnnotationPopup';
import { supabase } from './lib/supabase';

const AnnotationsGraph = lazy(() => import('./pages/AnnotationsGraph').then(m => ({ default: m.AnnotationsGraph })));

type Page = 'feed' | 'graph' | 'auth';

function AppContent() {
  const { profile } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('feed');
  const [randomAnnotationId, setRandomAnnotationId] = useState<string | null>(null);

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

  const handleNavigateGraph = useCallback(() => setCurrentPage('graph'), []);
  const handleNavigateHome = useCallback(() => setCurrentPage('feed'), []);
  const handleNavigateAuth = useCallback(() => setCurrentPage('auth'), []);

  if (currentPage === 'auth') {
    return <AuthPage onAuthSuccess={() => setCurrentPage('feed')} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <Header
        onRandomAnnotation={handleRandomAnnotation}
        onNavigateGraph={handleNavigateGraph}
        onNavigateHome={handleNavigateHome}
        onNavigateAuth={handleNavigateAuth}
      />

      {profile?.is_admin && (
        <div className="bg-green-600 border-b border-green-700">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2">
            <a
              href="/admin.html"
              className="flex items-center justify-center gap-2 text-white hover:text-green-100 transition-colors font-medium"
            >
              Админ-панель
            </a>
          </div>
        </div>
      )}

      <main>
        {currentPage === 'feed' && <MainFeed />}
        {currentPage === 'graph' && (
          <Suspense fallback={
            <div className="max-w-4xl mx-auto px-4 py-8">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 animate-pulse">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4"></div>
                <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
            </div>
          }>
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
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
