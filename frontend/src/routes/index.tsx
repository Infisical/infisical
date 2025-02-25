import { Router, Route as RootRoute } from '@tanstack/react-router';
import { DedicatedInstancesPage, DedicatedInstanceDetailsPage } from '@app/pages/organization/DedicatedInstancesPage';

// ... existing routes ...

// Add dedicated instances routes
const dedicatedInstancesRoute = new RootRoute({
  path: '/organization/:organizationId/dedicated-instances',
  component: DedicatedInstancesPage
});

const dedicatedInstanceDetailsRoute = new RootRoute({
  path: '/organization/:organizationId/dedicated-instances/:instanceId',
  component: DedicatedInstanceDetailsPage
});

// Add to routeTree
routeTree.addChildren([dedicatedInstancesRoute, dedicatedInstanceDetailsRoute]);

// Create and export router
export const router = new Router({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
} 