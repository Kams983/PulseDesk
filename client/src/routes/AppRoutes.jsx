import { Route, Routes } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/routes/ProtectedRoute';
import AppointmentsPage from '@/pages/AppointmentsPage';
import DashboardPage from '@/pages/DashboardPage';
import DoctorsPage from '@/pages/DoctorsPage';
import LoginPage from '@/pages/LoginPage';
import NotFoundPage from '@/pages/NotFoundPage';
import SchedulerPage from '@/pages/SchedulerPage';
import { ROLES } from '@/utils/constants';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* one guard for everything inside the shell, and a second one only where the role matters */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="scheduler" element={<SchedulerPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route
          path="doctors"
          element={
            <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
              <DoctorsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
