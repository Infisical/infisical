import { OrganizationActionScope } from "@app/db/schemas";
import { TActorContext } from "@app/domains/lib/actor-context";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";

import { BillingAccess } from "../../models/billing-access";

// Billing belongs to the root org, so a sub-org is refused. With access, a self-hosted instance admin reads another
// org without being a member; without it, membership and the Billing permission are always required.
export const assertBillingRead = async (
  orgPermissionService: TOrgPermissionService,
  { actor, orgId, access }: { actor: TActorContext; orgId: string; access?: BillingAccess }
) => {
  if (access?.readsWithoutMembership(orgId, actor.org.id)) return;
  const permission = await orgPermissionService.getOrgPermission({
    actor,
    orgId,
    scope: OrganizationActionScope.ParentOrganization
  });
  permission.assert({ action: OrgPermissionBillingActions.Read, subject: OrgPermissionSubjects.Billing });
};

export const assertManageBilling = async (
  orgPermissionService: TOrgPermissionService,
  { actor, orgId }: { actor: TActorContext; orgId: string }
) => {
  const permission = await orgPermissionService.getOrgPermission({
    actor,
    orgId,
    scope: OrganizationActionScope.ParentOrganization
  });
  permission.assert({ action: OrgPermissionBillingActions.ManageBilling, subject: OrgPermissionSubjects.Billing });
};
