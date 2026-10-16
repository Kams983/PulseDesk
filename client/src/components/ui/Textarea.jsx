import { forwardRef, useId } from 'react';

const Textarea = forwardRef(function Textarea({ label, error, helper, id, rows = 3, className = '', ...props }, ref) {
  const generatedId = useId();
  const textareaId = id || generatedId;
  const describedBy = error ? `${textareaId}-error` : helper ? `${textareaId}-helper` : undefined;

  return (
    <div>
      <label htmlFor={textareaId} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full resize-y rounded-control border bg-card px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:border-primary ${
          error ? 'border-danger' : 'border-line'
        } ${className}`}
        {...props}
      />
      {error ? (
        <p id={`${textareaId}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : helper ? (
        <p id={`${textareaId}-helper`} className="mt-1.5 text-xs text-ink-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
});

export default Textarea;
