import { useMemo } from "react";
import { EyeOffIcon, LockIcon, UserCogIcon } from "lucide-react";

import {
  MEMBER_KIND,
  memberDisplayName,
  memberSubtitle
} from "@app/components/agent-vault/MemberName";
import {
  Badge,
  OverflowBadgeList,
  RowLink,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows
} from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import { canReadAgentVaultMembers } from "@app/helpers/agentVaultPermissions";
import {
  TAgentVaultProductMember,
  TAgentVaultRoleThatCanUse
} from "@app/hooks/api/agentVault/types";
import { useListAllAgentVaultMembers } from "@app/hooks/api/agentVaultRoles";

const RoleTypeBadge = ({ role }: { role: TAgentVaultRoleThatCanUse }) =>
  role.isBuiltIn ? (
    <Badge variant="neutral">
      <LockIcon />
      Built-In
    </Badge>
  ) : (
    <Badge variant="info">
      <UserCogIcon />
      Custom
    </Badge>
  );

// The holders the caller can read, and one badge counting the rest, whom the role's member count still includes.
type THolderBadge =
  | { kind: "member"; member: TAgentVaultProductMember }
  | { kind: "hidden"; count: number };

const holderIconOf = (item: THolderBadge) => {
  const Icon = item.kind === "member" ? MEMBER_KIND[item.member.type].icon : EyeOffIcon;
  return <Icon />;
};

const MembersCell = ({
  holders,
  memberCount,
  canListMembers,
  isMembersPending
}: {
  holders: TAgentVaultProductMember[];
  memberCount: number;
  canListMembers: boolean;
  isMembersPending: boolean;
}) => {
  if (!canListMembers) {
    return <span className={memberCount ? "text-sm" : "text-sm text-muted"}>{memberCount}</span>;
  }
  if (isMembersPending) return <Skeleton className="h-4 w-32" />;

  const hiddenCount = Math.max(0, memberCount - holders.length);
  const items: THolderBadge[] = [
    ...holders.map((member) => ({ kind: "member" as const, member })),
    ...(hiddenCount ? [{ kind: "hidden" as const, count: hiddenCount }] : [])
  ];
  if (!items.length) return <span className="text-sm text-muted">No members</span>;

  return (
    <OverflowBadgeList
      items={items}
      getKey={(item) =>
        item.kind === "member" ? `${item.member.type}:${item.member.id}` : "hidden"
      }
      getLabel={(item) =>
        item.kind === "member" ? memberDisplayName(item.member) : `${item.count} hidden`
      }
      getTooltip={(item) =>
        item.kind === "member"
          ? memberSubtitle(item.member)
          : "Members your roles don't let you view."
      }
      getIcon={holderIconOf}
      maxBadgeWidth={200}
      className="w-full"
    />
  );
};

type Props = {
  roles?: TAgentVaultRoleThatCanUse[];
  isPending: boolean;
};

// Read-only: who can use something follows from roles, which are changed on each role's page.
export const RolesThatCanUseTable = ({ roles, isPending }: Props) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const { permission } = useProjectPermission();
  const canReadMembers = canReadAgentVaultMembers(permission);
  const {
    data: members,
    isPending: isMembersPending,
    isError: isMembersError
  } = useListAllAgentVaultMembers(projectId, { enabled: canReadMembers });

  const holdersBySlug = useMemo(() => {
    const bySlug = new Map<string, TAgentVaultProductMember[]>();
    (members?.items ?? []).forEach((member) =>
      member.roles.forEach((slug) => bySlug.set(slug, [...(bySlug.get(slug) ?? []), member]))
    );
    return bySlug;
  }, [members]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead isTruncatable className="w-1/3">
            Role
          </TableHead>
          <TableHead className="w-1/2">Members</TableHead>
          <TableHead>Type</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending && <TableSkeletonRows columns={3} rows={2} />}
        {roles?.map((role) => (
          // Admin has no id, so rows are keyed by slug.
          <TableRow key={role.slug} linked>
            <TableCell isTruncatable className="min-w-40">
              <RowLink
                to="/organizations/$orgId/projects/agent-vault/$projectId/roles/$roleSlug"
                params={{ orgId: currentOrg.id, projectId, roleSlug: role.slug }}
                title={role.name}
              >
                {role.name}
              </RowLink>
            </TableCell>
            {/* Truncatable so the column's width bounds the badges and the overflow collapses into "+N". */}
            <TableCell isTruncatable className="min-w-48">
              <MembersCell
                holders={holdersBySlug.get(role.slug) ?? []}
                memberCount={role.memberCount}
                canListMembers={canReadMembers && !isMembersError}
                isMembersPending={isMembersPending}
              />
            </TableCell>
            <TableCell>
              <RoleTypeBadge role={role} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
