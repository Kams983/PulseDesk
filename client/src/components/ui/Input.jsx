import { forwardRef, useId } from 'react';

// forwardRef so react-hook-form's register() can attach to the real input
const Input = forwardRef(function Input({ label, error, helper, id, className = '', ...props }, ref) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined;

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded-control border bg-card px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:border-primary focus-visible:ring-0 ${
          error ? 'border-danger' : 'border-line'
        } ${className}`}
        {...props}
      />
      {/* the label stays put and the hint explains the field, so a placeholder is never the only cue */}
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : helper ? (
        <p id={`${inputId}-helper`} className="mt-1.5 text-xs text-ink-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
