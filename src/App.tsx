import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import ConfigWarning from './components/ConfigWarning';
import RequireAdmin from './components/RequireAdmin';
import { isSupabaseConfigured } from './lib/supabase';
import BookingPage from './pages/BookingPage';
import LoginPage from './pages/LoginPage';
import AgendaPage from './pages/admin/AgendaPage';
import ServicesPage from './pages/admin/ServicesPage';
import SettingsPage from './pages/admin/SettingsPage';
import StaffPage from './pages/admin/StaffPage';

export default function App() {
  if (!isSupabaseConfigured) return <ConfigWarning />;

  return (
    <Routes>
      <Route path="/" element={<BookingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<AgendaPage />} />
        <Route path="servicios" element={<ServicesPage />} />
        <Route path="profesionales" element={<StaffPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
