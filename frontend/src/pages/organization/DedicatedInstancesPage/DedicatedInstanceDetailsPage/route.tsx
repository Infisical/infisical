import { createFileRoute } from '@tanstack/react-router';
import { DedicatedInstanceDetailsPage } from '../DedicatedInstanceDetailsPage';

export const Route = createFileRoute('/_authenticate/_inject-org-details/_org-layout/organization/dedicated-instances/$instanceId')({
  component: DedicatedInstanceDetailsPage
}); 