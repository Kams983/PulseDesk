// Skeleton shapes mirror the card they stand in for, so the layout is already communicating before the
// data arrives. A spinner over an empty card tells the user nothing about what is coming.
export default function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-control bg-page ${className}`} aria-hidden="true" />;
}
