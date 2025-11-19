import { createFileRoute } from "@tanstack/react-router";

import { fetchOrganizationById, organizationKeys } from "@app/hooks/api/organization/queries";
import { fetchUserOrgPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { fetchOrgSubscription, subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";

// Route context to fill in organization's data like details, subscription etc
export const Route = createFileRoute("/_authenticate/_inject-org-details")({
  beforeLoad: async ({ context, params }) => {
    let organizationId: string;

    if ((params as { orgId?: string })?.orgId) {
      organizationId = (params as { orgId: string }).orgId;
    } else {
      organizationId = context.organizationId!;
    }

    await context.queryClient.ensureQueryData({
      queryKey: organizationKeys.getOrgById(organizationId),
      queryFn: () => fetchOrganizationById(organizationId)
    });

    await context.queryClient.ensureQueryData({
      queryKey: subscriptionQueryKeys.getOrgSubsription(organizationId),
      queryFn: () => fetchOrgSubscription(organizationId)
    });

    await context.queryClient.ensureQueryData({
      queryKey: roleQueryKeys.getUserOrgPermissions({ orgId: organizationId }),
      queryFn: () => fetchUserOrgPermissions({ orgId: organizationId })
    });
    return { organizationId };
  }
});
