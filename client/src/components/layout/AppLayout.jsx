import { Outlet } from 'react-router-dom';
import ConnectionNotice from './ConnectionNotice';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

// The shell every signed in page renders inside. The rail, the account bar and the page share one centred
// column, so their edges line up and the space beside the rail is the page's own margin rather than a gap
// that grows with the screen. Below lg the rail is replaced by the drawer in the bar.
export default function AppLayout() {
  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-4 sm:px-6">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 pb-12 pt-2">
            <Outlet />
          </main>
        </div>
      </div>

      {/* inside the shell on purpose: it only means something once there is a session to keep live */}
      <ConnectionNotice />
    </div>
  );
}
