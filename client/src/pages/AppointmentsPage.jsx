import { ClipboardList } from 'lucide-react';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';

// Phase 6 adds the live list here: filters, paging, the workflow actions and the socket refresh.
export default function AppointmentsPage() {
  return (
    <Card title="Appointments" subtitle="Every visit, filtered and searchable">
      <EmptyState
        icon={ClipboardList}
        title="Coming in the next phase"
        text="Filters, paging and the arrive, complete and cancel actions land here next."
      />
    </Card>
  );
}
