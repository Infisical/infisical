import { createFileRoute } from '@tanstack/react-router';
import { DedicatedInstancesPage } from '@app/pages/organization/DedicatedInstancesPage';

export const Route = createFileRoute('/_authenticate/_inject-org-details/_org-layout/organization/dedicated-instances')({
  component: DedicatedInstancesPage,
}); 