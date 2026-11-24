import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";

import { DisabledReasonTooltip } from "@app/components/agent-vault/DisabledReasonTooltip";
import { MemberName, memberDisplayName } from "@app/components/agent-vault/MemberName";
import { useAgentVaultAdminGuard } from "@app/components/agent-vault/useAgentVaultAdminGuard";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  RowLink,
  Table,
  TableAttachedFooter,
  TableBody,
  TableCell,
  TableRow,
  TableSkeletonRows
} from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import {
  canChangeAgentVaultMembers,
  canReadAgentVaultMembers
} from "@app/helpers/agentVaultPermissions";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { useListAllAgentVaultMembers } from "@app/hooks/api/agentVaultRoles";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { AgentVaultAccessControlTab } from "@app/pages/agent-vault/AgentVaultAccessControlPage/AgentVaultAccessControlPage";

import { AssignRoleDialog } from "./AssignRoleDialog";

const PER_PAGE = 10;

const TAB_OF: Record<AgentVaultMemberType, AgentVaultAccessControlTab> = {
  [AgentVaultMemberType.User]: AgentVaultAccessControlTab.Users,
  [AgentVaultMemberType.MachineIdentity]: AgentVaultAccessControlTab.MachineIdentities,
  [AgentVaultMemberType.Group]: AgentVaultAccessControlTab.Groups
};

// The v3 Pagination's per-page menu and first and last buttons don't fit this narrow card.
const CompactPager = ({
  page,
  count,
  onChangePage
}: {
  page: number;
  count: number;
  onChangePage: (page: number) => void;
}) => (
  <TableAttachedFooter className="justify-between px-3">
    <span className="text-xs text-muted">
      {(page - 1) * PER_PAGE + 1} - {Math.min(page * PER_PAGE, count)} of {count}
    </span>
    <div className="flex items-center gap-1">
      <IconButton
        variant="ghost"
        size="xs"
        aria-label="Go to previous page"
        isDisabled={page <= 1}
        onClick={() => onChangePage(page - 1)}
      >
        <ChevronLeftIcon />
      </IconButton>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label="Go to next page"
        isDisabled={page * PER_PAGE >= count}
        onClick={() => onChangePage(page + 1)}
      >
        <ChevronRightIcon />
      </IconButton>
    </div>
  </TableAttachedFooter>
);

export const AssignedToCard = ({ roleSlug, roleName }: { roleSlug: string; roleName: string }) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const { permission } = useProjectPermission();
  const { isViewerAdmin } = useAgentVaultAdminGuard();
  const canReadMembers = canReadAgentVaultMembers(permission);
  const { data, isPending, isError, refetch } = useListAllAgentVaultMembers(projectId, {
    enabled: canReadMembers
  });
  const [page, setPage] = useState(1);
  const [isAssignOpen, setIsAssignOpen] = useState(false);

  const members = data?.items ?? [];
  const holders = members.filter((member) => member.roles.includes(roleSlug));
  const pageCount = Math.max(1, Math.ceil(holders.length / PER_PAGE));
  // Assigning or removing holders can shrink the list under the page someone was on.
  const currentPage = Math.min(page, pageCount);
  const pageRows = holders.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  // No Access can't sit beside another role, so assigning it here would strip members' other roles. Only an Admin may
  // make someone an Admin.
  const canAssign =
    canReadMembers &&
    canChangeAgentVaultMembers(permission) &&
    roleSlug !== ProjectMembershipRole.NoAccess &&
    (roleSlug !== ProjectMembershipRole.Admin || isViewerAdmin);
  let assignDeniedReason: string | undefined;
  if (!canAssign) {
    assignDeniedReason =
      roleSlug === ProjectMembershipRole.Admin && !isViewerAdmin
        ? "Only an admin can give someone the Admin role"
        : "You don't have permission to give members roles";
  }

  const accessControlLink = (tab: AgentVaultAccessControlTab) => ({
    to: "/organizations/$orgId/projects/agent-vault/$projectId/access-management" as const,
    params: { orgId: currentOrg.id, projectId },
    search: { selectedTab: tab }
  });

  const renderBody = () => {
    if (!canReadMembers) {
      return (
        <p className="text-sm text-muted">
          You need permission to view members to see who holds this role.
        </p>
      );
    }
    if (isPending) {
      return (
        <Table>
          <TableBody>
            <TableSkeletonRows columns={1} rows={3} />
          </TableBody>
        </Table>
      );
    }
    if (isError) {
      return (
        <div className="flex flex-col items-start gap-2 text-sm text-muted">
          Couldn&apos;t load who holds this role.
          <Button variant="outline" size="xs" onClick={() => refetch()}>
            Try Again
          </Button>
        </div>
      );
    }
    if (!holders.length) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Nobody holds this role yet</EmptyTitle>
            {canAssign && (
              <EmptyDescription>Assign it to users, machine identities or groups.</EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <>
        <Table hasAttachedFooter={pageCount > 1}>
          <TableBody>
            {pageRows.map((member) => (
              <TableRow key={`${member.type}:${member.id}`} linked>
                <TableCell isTruncatable>
                  <RowLink
                    {...accessControlLink(TAB_OF[member.type])}
                    title={memberDisplayName(member)}
                  >
                    <MemberName member={member} isSingleLine />
                  </RowLink>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {pageCount > 1 && (
          <CompactPager page={currentPage} count={holders.length} onChangePage={setPage} />
        )}
      </>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assigned To</CardTitle>
        <CardDescription>
          The users, machine identities and groups that hold this role.
        </CardDescription>
      </CardHeader>
      <CardContent>{renderBody()}</CardContent>
      {roleSlug !== ProjectMembershipRole.NoAccess && (
        <CardFooter>
          <DisabledReasonTooltip disabledReason={assignDeniedReason}>
            <Button
              variant="outline"
              size="xs"
              isDisabled={!canAssign}
              onClick={() => setIsAssignOpen(true)}
            >
              <PlusIcon />
              Assign
            </Button>
          </DisabledReasonTooltip>
        </CardFooter>
      )}
      {canAssign && (
        <AssignRoleDialog
          isOpen={isAssignOpen}
          onOpenChange={setIsAssignOpen}
          roleSlug={roleSlug}
          roleName={roleName}
          members={members}
        />
      )}
    </Card>
  );
};
