import Skeleton from './Skeleton';

export default function StatCard({ icon: Icon, label, value, tone = 'bg-primary-tint text-primary', isLoading = false }) {
  return (
    <div className="rounded-card bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-pill ${tone}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-ink-muted">{label}</p>
      </div>
      <div className="mt-4">
        {isLoading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-bold text-ink">{value}</p>}
      </div>
    </div>
  );
}
