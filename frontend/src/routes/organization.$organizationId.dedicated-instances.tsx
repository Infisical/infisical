import { createFileRoute } from '@tanstack/react-router';
import { DedicatedInstancesPage } from '@app/pages/organization/DedicatedInstancesPage';

export const Route = createFileRoute('/organization/$organizationId/dedicated-instances')({
  component: DedicatedInstancesPage,
}); 