import { Stethoscope } from 'lucide-react';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';

// Phase 7 adds the register and the schedule editor here. Only a super admin can reach this route.
export default function DoctorsPage() {
  return (
    <Card title="Doctors" subtitle="The register and the weekly schedules">
      <EmptyState
        icon={Stethoscope}
        title="Coming in the next phase"
        text="Creating a doctor and editing a weekly schedule land here next."
      />
    </Card>
  );
}
