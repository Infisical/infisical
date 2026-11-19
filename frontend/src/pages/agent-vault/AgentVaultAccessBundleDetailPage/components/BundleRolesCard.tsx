import { LockIcon, PackageIcon, UserCogIcon } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  RowLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useListAgentVaultAccessBundleRoles } from "@app/hooks/api/agentVault";
import { TAgentVaultAccessBundleRole } from "@app/hooks/api/agentVault/types";

const RoleTypeBadge = ({ role }: { role: TAgentVaultAccessBundleRole }) => {
  if (role.isBuiltIn) {
    return (
      <Badge variant="neutral">
        <LockIcon />
        Built-In
      </Badge>
    );
  }
  if (role.isBundleRole) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="info">
            <PackageIcon />
            Bundle Role
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          Made for this bundle from the people it was given to before roles.
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Badge variant="info">
      <UserCogIcon />
      Custom
    </Badge>
  );
};

// Read-only: who can use a bundle follows from roles, which are changed on each role's page.
export const BundleRolesCard = ({ accessBundleId }: { accessBundleId: string }) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const {
    data: roles,
    isPending,
    isError,
    refetch
  } = useListAgentVaultAccessBundleRoles(projectId, accessBundleId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who Can Use This Bundle</CardTitle>
        <CardDescription>
          Holders of these roles can start sessions from this bundle, with every service and skill
          in it. Open a role to change what it allows or who holds it.
        </CardDescription>
      </CardHeader>
      {isError ? (
        <div className="flex flex-col items-start gap-2 px-6 pb-6 text-sm text-muted">
          Couldn&apos;t load the roles that can use this bundle.
          <Button variant="outline" size="xs" onClick={() => refetch()}>
            Try Again
          </Button>
        </div>
      ) : (
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
      )}
    </Card>
  );
};
