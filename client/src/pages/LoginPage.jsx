import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { HeartPulse, TriangleAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { APP_NAME } from '@/utils/constants';
import { firstName } from '@/utils/formatters';

// the same accounts the seed creates, so a reviewer can sign in as each role without typing
const DEMO_PASSWORD = 'Password123!';
const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@emr.test' },
  { label: 'Receptionist', email: 'reception@emr.test' },
  { label: 'Doctor', email: 'dr.okafor@emr.test' },
];

const schema = z.object({
  email: z.email({ message: 'Enter a valid email address' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export default function LoginPage() {
  useDocumentTitle('Sign in');

  const { user, login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  // the startup screen settled the session before this page was ever mounted
  if (user) {
    return <Navigate to={location.state?.from || '/'} replace />;
  }

  async function onSubmit(values) {
    setFormError('');

    try {
      const signedIn = await login(values.email, values.password);

      toast.success(`Welcome back, ${firstName(signedIn.name)}`);
      // the page the user was actually trying to open before the guard sent them here
      navigate(location.state?.from || '/', { replace: true });
    } catch (error) {
      setFormError(error.message);
    }
  }

  function fillDemoAccount(account) {
    setValue('email', account.email, { shouldValidate: true });
    setValue('password', DEMO_PASSWORD, { shouldValidate: true });
    setFormError('');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-panel bg-card p-6 shadow-pop sm:p-8">
          <div className="flex items-center gap-3">
            {/* while the sign in request runs, the mark keeps the beat of the loader in the button */}
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-control bg-primary text-white ${
                isSubmitting ? 'astra-origin animate-astra-breathe' : ''
              }`}
            >
              <HeartPulse size={22} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-ink">Sign in</h1>
              <p className="text-sm text-ink-muted">{APP_NAME}: clinic appointment management</p>
            </div>
          </div>

          {formError ? (
            <p className="mt-6 flex items-start gap-2 rounded-control bg-danger-tint px-3 py-2 text-sm text-danger">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {formError}
            </p>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Input
              label="Email"
              type="email"
              autoComplete="username"
              placeholder="you@emr.test"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="At least 8 characters"
              error={errors.password?.message}
              {...register('password')}
            />
            <Button type="submit" loading={isSubmitting} className="w-full">
              Sign in
            </Button>
          </form>
        </div>

        <div className="mt-4 rounded-panel bg-card/70 p-4 shadow-card">
          <p className="text-sm font-semibold text-ink">Demo accounts</p>
          <p className="mt-1 text-xs text-ink-muted">
            Seeds the form with a seeded account. The password is the same for all of them.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Button
                key={account.email}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => fillDemoAccount(account)}
              >
                {account.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
