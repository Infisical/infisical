import { OrganizationActionScope } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";

import { HoneyTokenConfigStatus } from "../../honey-token-config/honey-token-config-enums";
import type { THoneyTokenConfigServiceFactoryDep } from "../../honey-token-config/honey-token-config-types";
import { HoneyTokenManagedBy, HoneyTokenType } from "../honey-token-enums";
import { AwsHoneyTokenDeploymentUnavailableReason } from "./honey-token-aws-enums";
import { getManagedHoneyTokenUnavailableReason } from "./honey-token-aws-fns";

export const honeyTokenAwsConfigServiceFactory = ({
  honeyTokenConfigDAL,
  permissionService
}: Pick<THoneyTokenConfigServiceFactoryDep, "honeyTokenConfigDAL" | "permissionService">) => {
  const $getOrganizationUnavailableReason = async (orgId: string) => {
    const orgConfig = await honeyTokenConfigDAL.findOne({ orgId, type: HoneyTokenType.AWS });

    if (!orgConfig?.connectionId) return AwsHoneyTokenDeploymentUnavailableReason.AccountNotConnected;
    if (orgConfig.status !== HoneyTokenConfigStatus.Complete) {
      return AwsHoneyTokenDeploymentUnavailableReason.StackVerificationPending;
    }

    return null;
  };

  // Any org member can list these, since creating a honey token in a project depends on them. They hold
  // no settings, only whether each AWS account can be used.
  const listDeploymentOptions = async (orgPermission: OrgServiceActor) => {
    await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId
    });

    return [
      {
        managedBy: HoneyTokenManagedBy.Instance,
        unavailableReason: getManagedHoneyTokenUnavailableReason()
      },
      {
        managedBy: HoneyTokenManagedBy.Organization,
        unavailableReason: await $getOrganizationUnavailableReason(orgPermission.orgId)
      }
    ];
  };

  return { listDeploymentOptions };
};
