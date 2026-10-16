import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page p-6">
      <Card className="w-full max-w-md" bodyClassName="p-6">
        <EmptyState
          icon={Compass}
          title="That page does not exist"
          text="The link may be old, or the address may have a typo."
          action={
            <Link to="/">
              <Button>Back to the dashboard</Button>
            </Link>
          }
        />
      </Card>
    </main>
  );
}
