import { TriangleAlert } from 'lucide-react';
import Button from './Button';

// The message is whatever the api said in plain language; a status code or a stack trace never reaches
// this component. Retry is offered whenever the failure could simply be a dropped connection.
export default function ErrorMessage({ message = 'Something went wrong', onRetry, className = '' }) {
  return (
    <div className={`flex flex-col items-start gap-3 rounded-card bg-danger-tint px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <p className="flex items-start gap-2 text-sm text-danger">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        {message}
      </p>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
