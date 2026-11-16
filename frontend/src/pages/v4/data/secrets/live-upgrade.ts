import { useMigrateProjectToV3 } from "@app/hooks/api/projects/mutations";
import { useGetUserProjectPermissions } from "@app/hooks/api/roles/queries";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import type { SecretsUpgradeAdapter } from "./contract-upgrade";

export const secretsUpgradeLive: SecretsUpgradeAdapter = {
  useIsProjectAdmin: (projectId) =>
    Boolean(
      useGetUserProjectPermissions({ projectId }).data?.memberships.some((membership) =>
        membership.roles.some((entry) => entry.role === ProjectMembershipRole.Admin)
      )
    ),
  useMigrateProjectToV3
};
