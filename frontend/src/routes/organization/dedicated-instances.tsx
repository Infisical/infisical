import { createFileRoute } from '@tanstack/react-router';
import { DedicatedInstancesPage, DedicatedInstanceDetailsPage } from '@app/pages/organization/DedicatedInstancesPage';

// List route
export const Route = createFileRoute('/organization/$organizationId/dedicated-instances')({
  component: DedicatedInstancesPage
});

// Details route
export const InstanceRoute = createFileRoute('/organization/$organizationId/dedicated-instances/$instanceId')({
  component: DedicatedInstanceDetailsPage
}); 