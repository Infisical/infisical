import { LockIcon, UserCogIcon } from "lucide-react";

import {
  Badge,
  RowLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { TAgentVaultRoleThatCanUse } from "@app/hooks/api/agentVault/types";

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

type Props = {
  roles?: TAgentVaultRoleThatCanUse[];
  isPending: boolean;
};

// Read-only: who can use something follows from roles, which are changed on each role's page.
export const RolesThatCanUseTable = ({ roles, isPending }: Props) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead isTruncatable className="w-full">
            Role
          </TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Members</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending && <TableSkeletonRows columns={3} rows={2} />}
        {roles?.map((role) => (
          // Admin has no id, so rows are keyed by slug.
          <TableRow key={role.slug} linked>
            <TableCell isTruncatable className="min-w-48">
              <RowLink
                to="/organizations/$orgId/projects/agent-vault/$projectId/roles/$roleSlug"
                params={{ orgId: currentOrg.id, projectId, roleSlug: role.slug }}
                title={role.name}
              >
                {role.name}
              </RowLink>
            </TableCell>
            <TableCell>
              <RoleTypeBadge role={role} />
            </TableCell>
            <TableCell className="text-right text-sm">
              <span className={role.memberCount ? undefined : "text-muted"}>
                {role.memberCount}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
