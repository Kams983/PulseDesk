import BootScreen from '@/components/ui/BootScreen';
import { useAuth } from '@/context/AuthContext';

// The sign out request needs a moment, and the page behind it is still the signed in app. Covering it
// with the loader means the shell does not disappear in pieces: a rail here, an account menu there.
export default function SignOutCurtain() {
  const { isSigningOut } = useAuth();

  if (!isSigningOut) {
    return null;
  }

  return <BootScreen overlay timed={false} label="Signing you out" note="Closing your session on this device" />;
}
