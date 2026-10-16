import { ChevronLeft, ChevronRight } from 'lucide-react';
import Select from './Select';

// page is 1 based. The size selector is optional: without onPageSizeChange the list uses a fixed size.
export default function Pagination({
  page,
  totalPages = 1,
  onChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  className = '',
}) {
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <p className="text-sm text-ink-muted">
        Page <span className="font-semibold text-ink">{page}</span> of {Math.max(totalPages, 1)}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <Select
            label="Rows"
            className="w-24"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            options={pageSizeOptions.map((size) => ({ value: size, label: String(size) }))}
          />
        ) : null}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(page - 1)}
            disabled={isFirst}
            aria-label="Previous page"
            className="rounded-pill p-2 text-ink-muted transition hover:bg-page hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => onChange(page + 1)}
            disabled={isLast}
            aria-label="Next page"
            className="rounded-pill p-2 text-ink-muted transition hover:bg-page hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
