import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { AdminAuthProvider } from '@/hooks/useAdminAuth';
import usePlexToken from '@/hooks/usePlexToken.tsx';
import AuthRedirectPage from '@/pages/AuthRedirectPage.tsx';
import ProtectedFormPage from '@/pages/ProtectedFormPage.tsx';
import { AdminCustomersPage } from '@/pages/admin/AdminCustomersPage';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { AdminLiveActivityPage } from '@/pages/admin/AdminLiveActivityPage';
import { AdminLoginPage } from '@/pages/admin/AdminLoginPage';
import { AdminPaymentsPage } from '@/pages/admin/AdminPaymentsPage';
import { AdminPlexSettingsPage } from '@/pages/admin/AdminPlexSettingsPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';

function App() {
  const [token, setToken] = usePlexToken();

  return (
    <AdminAuthProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          {/* Rutas Administrativas */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboardPage />} />
            <Route path="live-activity" element={<AdminLiveActivityPage />} />
            <Route path="customers" element={<AdminCustomersPage />} />
            <Route path="plex-settings" element={<AdminPlexSettingsPage />} />
            <Route path="payments" element={<AdminPaymentsPage />} />
            <Route path="users" element={<AdminUsersPage />} />
          </Route>

          {/* Redirección raíz al portal admin */}
          <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />

          {/* Rutas de soporte / autenticación OAuth */}
          <Route
            path="/auth-redirect"
            element={<AuthRedirectPage setPlexToken={setToken} />}
          />
          <Route
            path="/legacy-setup"
            element={
              <ProtectedFormPage plexToken={token} setPlexToken={setToken} />
            }
          />
        </Routes>
      </BrowserRouter>
    </AdminAuthProvider>
  );
}

export default App;
