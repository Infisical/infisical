import { createFileRoute } from "@tanstack/react-router";

import { fetchOrganizationById, organizationKeys } from "@app/hooks/api/organization/queries";
import { fetchOrgSubscription, subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";

export const Route = createFileRoute("/_authenticate/_org_details")({
  beforeLoad: async ({ context }) => {
    const organizationId = context.organizationId!;
    const orgDetails = await context.queryClient.fetchQuery({
      queryKey: organizationKeys.getOrgById(organizationId),
      queryFn: () => fetchOrganizationById(organizationId)
    });

    const subscription = await context.queryClient.fetchQuery({
      queryKey: subscriptionQueryKeys.getOrgSubsription(organizationId),
      queryFn: () => fetchOrgSubscription(organizationId)
    });

    return { organization: orgDetails, subscription };
  }
});
