import { ShieldIcon, UserCogIcon, UserIcon } from "lucide-react";

import { Badge } from "@app/components/v3";
import { useProject } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useAgentVaultRoleOptions } from "@app/hooks/api/agentVaultRoles";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

// Members list a custom role by its slug, so the name comes from the project's roles.
export const ProductRoleBadge = ({ role }: { role: string }) => {
  const { projectId } = useProject();
  const { findRole } = useAgentVaultRoleOptions(projectId);
  const name = findRole(role)?.name ?? formatProjectRoleName(role);

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

export const ProductRoleBadges = ({ roles }: { roles: string[] }) => (
  <div className="flex flex-wrap gap-1">
    {roles.map((role) => (
      <ProductRoleBadge key={role} role={role} />
    ))}
  </div>
);
