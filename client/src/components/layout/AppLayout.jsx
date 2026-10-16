import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

// The shell every signed in page renders inside: rail on the left, account bar on top, one outlet. The
// content column is padded rather than pushed, so the rail can overlap its own margin on a short screen.
export default function AppLayout() {
  return (
    <div className="min-h-screen bg-page">
      <Sidebar />

      <div className="lg:pl-[104px]">
        <TopBar />
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-12 pt-2 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
