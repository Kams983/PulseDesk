import { useState } from 'react';
import AppRoutes from '@/routes/AppRoutes';
import SignOutCurtain from '@/components/layout/SignOutCurtain';
import StartupScreen from '@/components/startup/StartupScreen';

// The providers live in main.jsx. This file decides what is on screen: the startup screen first, then a
// path. The loader calls back when its exit animation has finished, so the app is painted underneath a
// screen that has already wiped itself away.
export default function App() {
  const [startupDone, setStartupDone] = useState(false);

  if (!startupDone) {
    // the destination it reports is not needed here: the guard already sends a signed out browser to
    // the login page, and a signed in one to the page it asked for
    return <StartupScreen onDone={() => setStartupDone(true)} />;
  }

  return (
    <>
      <AppRoutes />
      {/* outside the routes on purpose: signing out is a transition between two of them */}
      <SignOutCurtain />
    </>
  );
}
