import { AnimatePresence, MotionConfig } from 'framer-motion';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppDataProvider } from './context/AppDataContext';
import { JobsProvider } from './context/JobsContext';
import { MotionPrefProvider } from './context/MotionPrefContext';
import { ToastProvider } from './context/ToastContext';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { OverviewPage } from './pages/OverviewPage';
import { AugmentStudioPage } from './pages/AugmentStudioPage';
import { ClassifierCheckPage } from './pages/ClassifierCheckPage';
import { GalleryPage } from './pages/GalleryPage';
import { LiveGeneratePage } from './pages/LiveGeneratePage';
import { ResultsDashboardPage } from './pages/ResultsDashboardPage';
import { ExportPage } from './pages/ExportPage';

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <ErrorBoundary key={location.pathname}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/augment" element={<AugmentStudioPage />} />
          <Route path="/classify" element={<ClassifierCheckPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/generate" element={<LiveGeneratePage />} />
          <Route path="/results" element={<ResultsDashboardPage />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <MotionPrefProvider>
          <ToastProvider>
            <AppDataProvider>
              <JobsProvider>
                <AppShell>
                  <AnimatedRoutes />
                </AppShell>
              </JobsProvider>
            </AppDataProvider>
          </ToastProvider>
        </MotionPrefProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}