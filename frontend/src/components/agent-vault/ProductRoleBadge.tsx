import { ShieldIcon, UserCogIcon, UserIcon } from "lucide-react";

import { Badge } from "@app/components/v3";
import { useProject } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { TAgentVaultRoleDetail } from "@app/hooks/api/agentVault/types";
import { useAgentVaultRoleOptions } from "@app/hooks/api/agentVaultRoles";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

// The members API sends each role's name beside its slug, so the name shows even to someone who can't read roles.
// Without it, the name comes from the project's roles.
export const ProductRoleBadge = ({ role, name: givenName }: { role: string; name?: string }) => {
  const { projectId } = useProject();
  const { findRole } = useAgentVaultRoleOptions(projectId);
  const name = givenName ?? findRole(role)?.name ?? formatProjectRoleName(role);

  if (role === ProjectMembershipRole.Admin) {
    return (
      <Badge variant="av">
        <ShieldIcon />
        {name}
      </Badge>
    );
  }

  return (
    <Badge variant="neutral">
      {role === ProjectMembershipRole.NoAccess ? <UserIcon /> : <UserCogIcon />}
      {name}
    </Badge>
  );
};

export const ProductRoleBadges = ({
  roles,
  roleDetails
}: {
  roles: string[];
  roleDetails?: TAgentVaultRoleDetail[];
}) => (
  <div className="flex flex-wrap gap-1">
    {roles.map((role) => (
      <ProductRoleBadge
        key={role}
        role={role}
        name={roleDetails?.find((detail) => detail.slug === role)?.name}
      />
    ))}
  </div>
);
