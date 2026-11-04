import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import PublicMapPage from './pages/PublicMapPage';
import { ForgotPasswordPage, LoginPage, NotFoundPage, ResetPasswordPage } from './pages/AuthPages';
import { RequireAuth } from './lib/auth';
import AdminLayout from './pages/admin/AdminLayout';

const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const LayersPage = lazy(() => import('./pages/admin/LayersPage'));
const UploadPage = lazy(() => import('./pages/admin/UploadPage'));
const EditorPage = lazy(() => import('./pages/admin/EditorPage'));
const AnalysisPage = lazy(() => import('./pages/admin/AnalysisPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const AuditPage = lazy(() => import('./pages/admin/AuditPage'));
const ReviewPage = lazy(() => import('./pages/admin/ReviewPages').then((module) => ({ default: module.ReviewPage })));
const ReviewDetailPage = lazy(() => import('./pages/admin/ReviewPages').then((module) => ({ default: module.ReviewDetailPage })));

function RouteFallback() {
  return (
    <div className="app-loading">
      <span className="spinner" aria-hidden="true" />
      <p>Memuat halaman…</p>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<PublicMapPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="layers" element={<LayersPage />} />
          <Route path="layers/new" element={<UploadPage />} />
          <Route path="layers/:id/edit" element={<EditorPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="review/:id" element={<ReviewDetailPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
          <Route
            path="users"
            element={
              <RequireAuth roles={['admin']}>
                <UsersPage />
              </RequireAuth>
            }
          />
          <Route
            path="audit"
            element={
              <RequireAuth roles={['admin']}>
                <AuditPage />
              </RequireAuth>
            }
          />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
