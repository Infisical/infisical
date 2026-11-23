import { ShieldIcon, UserCogIcon, UserIcon } from "lucide-react";

import { OverflowBadgeList } from "@app/components/v3";
import { useProject } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { TAgentVaultRoleDetail } from "@app/hooks/api/agentVault/types";
import { useAgentVaultRoleOptions } from "@app/hooks/api/agentVaultRoles";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const roleIconOf = (role: string) => {
  if (role === ProjectMembershipRole.Admin) return <ShieldIcon />;
  if (role === ProjectMembershipRole.NoAccess) return <UserIcon />;
  return <UserCogIcon />;
};

const roleItemIcon = (item: { slug: string }) => roleIconOf(item.slug);

// The members API sends each role's name beside its slug, so the name shows even to someone who can't read roles.
// Without it, the name comes from the project's roles.
const useRoleName = () => {
  const { projectId } = useProject();
  const { findRole } = useAgentVaultRoleOptions(projectId);
  return (role: string, givenName?: string) =>
    givenName ?? findRole(role)?.name ?? formatProjectRoleName(role);
};

const BUILT_IN_ORDER: string[] = [ProjectMembershipRole.Admin, ProjectMembershipRole.NoAccess];

// Admin and No Access first, then by name, so a member's roles read the same on every row.
export const sortRoleBadges = <T extends { slug: string; name: string }>(roles: T[]) =>
  [...roles].sort((a, b) => {
    const rankA = BUILT_IN_ORDER.indexOf(a.slug);
    const rankB = BUILT_IN_ORDER.indexOf(b.slug);
    if (rankA !== rankB) return (rankA === -1 ? 2 : rankA) - (rankB === -1 ? 2 : rankB);
    return a.name.localeCompare(b.name);
  });

// A member can hold up to 10 roles, so the list shows what fits and rolls the rest into "+N".
export const ProductRoleBadges = ({
  roles,
  roleDetails
}: {
  roles: string[];
  roleDetails?: TAgentVaultRoleDetail[];
}) => {
  const nameOf = useRoleName();
  const items = sortRoleBadges(
    roles.map((slug) => ({
      slug,
      name: nameOf(slug, roleDetails?.find((detail) => detail.slug === slug)?.name)
    }))
  );
  return (
    <div className="max-w-72">
      <OverflowBadgeList
        items={items}
        getKey={(item) => item.slug}
        getLabel={(item) => item.name}
        getVariant={(item) => (item.slug === ProjectMembershipRole.Admin ? "av" : "neutral")}
        getIcon={roleItemIcon}
      />
    </div>
  );
};
