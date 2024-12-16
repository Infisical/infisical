import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";
import { createFileRoute } from "@tanstack/react-router";

import { OrgPermissionSet } from "@app/context/OrgPermissionContext/types";
import { fetchOrganizationById, organizationKeys } from "@app/hooks/api/organization/queries";
import {
  conditionsMatcher,
  fetchUserOrgPermissions,
  roleQueryKeys
} from "@app/hooks/api/roles/queries";
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

    const orgPermission = await context.queryClient.fetchQuery({
      queryKey: roleQueryKeys.getUserOrgPermissions({ orgId: organizationId }),
      queryFn: () => fetchUserOrgPermissions({ orgId: organizationId })
    });

    const rule = unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(orgPermission.permissions);
    const ability = createMongoAbility<OrgPermissionSet>(rule, { conditionsMatcher });

    return {
      organization: orgDetails,
      subscription,
      orgPermission: { permission: ability, membership: orgPermission.membership }
    };
  }
});
