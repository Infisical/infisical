import { createFileRoute } from '@tanstack/react-router';
import { DedicatedInstanceDetailsPage } from '@app/pages/organization/DedicatedInstancesPage';

export const Route = createFileRoute('/organization/$organizationId/dedicated-instances/$instanceId')({
  component: DedicatedInstanceDetailsPage,
}); 