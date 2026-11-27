import { useEffect, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";

import { DisabledReasonMenuItem } from "@app/components/agent-vault/DisabledReasonMenuItem";
import {
  deniedReason,
  DisabledReasonTooltip
} from "@app/components/agent-vault/DisabledReasonTooltip";
import { memberDisplayName } from "@app/components/agent-vault/MemberName";
import { PendingInvitationBadge } from "@app/components/agent-vault/PendingInvitationBadge";
import { ProductRoleBadges } from "@app/components/agent-vault/ProductRoleBadge";
import { useAgentVaultAdminGuard } from "@app/components/agent-vault/useAgentVaultAdminGuard";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { HighlightText } from "@app/components/utilities/HighlightText";
import {
  Button,
  Card,
  CardContent,
  ConfirmationAlertDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProjectPermission,
  useUser,
  useProject
} from "@app/context";
import { agentVaultMemberActionDeniedReason } from "@app/helpers/agentVaultMembers";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, useResetPageHelper, useResetPageOnSearch } from "@app/hooks";
import { useListAgentVaultMembers, useRevokeAgentVaultMembers } from "@app/hooks/api/agentVault";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultProductMemberOf } from "@app/hooks/api/agentVault/types";

import { InviteMembersDialog } from "./InviteMembersDialog";
import { ProductRoleDialog } from "./ProductRoleDialog";

type TUserMember = TAgentVaultProductMemberOf<AgentVaultMemberType.User>;

const REMOVE_DESCRIPTION =
  "They lose access to this project and every role they hold here. Any active session they hold stops reaching its hosts at the next proxy poll.";

export const MembersTab = () => {
  const { projectId } = useProject();
  const { user } = useUser();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultAccessControlTable", PreferenceKey.PerPage, 20)
  );

  const { data, isPending } = useListAgentVaultMembers(projectId, {
    actorType: AgentVaultMemberType.User,
    search: debouncedSearch.trim() || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const revokeMembers = useRevokeAgentVaultMembers(projectId);

  const filtered = data?.members ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });
  useResetPageOnSearch({ debouncedSearch, setPage });

  const isFiltered = Boolean(debouncedSearch.trim());

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<TUserMember | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TUserMember | null>(null);

  const { permission } = useProjectPermission();
  const { blockedReasonFor } = useAgentVaultAdminGuard();
  const canAddMembers = permission.can(
    ProjectPermissionMemberActions.Create,
    ProjectPermissionSub.Member
  );
  const requesterEmail = useSearch({
    strict: false,
    select: (el) => (el as { requesterEmail?: string })?.requesterEmail
  });

  // An access-request notification links here with the requester in the URL.
  useEffect(() => {
    if (requesterEmail && canAddMembers) setIsInviteOpen(true);
  }, [requesterEmail, canAddMembers]);

  const handleRemove = async () => {
    try {
      if (!memberToRemove) return;
      await revokeMembers.mutateAsync({ userIds: [memberToRemove.id] });
      createNotification({
        text: `${memberDisplayName(memberToRemove)} removed`,
        type: "success"
      });
      setMemberToRemove(null);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
          />
        </InputGroup>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Member}>
          {(isAllowed) => (
            <DisabledReasonTooltip
              disabledReason={deniedReason(isAllowed, "You don't have permission to add users")}
            >
              <Button variant="av" isDisabled={!isAllowed} onClick={() => setIsInviteOpen(true)}>
                <PlusIcon />
                Add Users
              </Button>
            </DisabledReasonTooltip>
          )}
        </ProjectPermissionCan>
      </CardContent>

      {!isPending && filtered.length === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{isFiltered ? "No users match your search" : "No users yet"}</EmptyTitle>
              <EmptyDescription>
                {isFiltered ? "Try a different search term." : "Add users to give them access."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead isTruncatable className="w-1/3">
                Name
              </TableHead>
              <TableHead isTruncatable className="w-1/3">
                Email
              </TableHead>
              <TableHead>Roles</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`member-skeleton-${index}`}>
                  {Array.from({ length: 4 }).map((__, cell) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`member-skeleton-${index}-${cell}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isPending &&
              filtered.map((member) => {
                const isSelf = member.id === user?.id;
                const name = [member.firstName, member.lastName].filter(Boolean).join(" ");
                const blockedReason = blockedReasonFor(member.roles);

                return (
                  <TableRow key={member.id}>
                    <TableCell isTruncatable className="min-w-32" title={name || undefined}>
                      {name ? (
                        <HighlightText text={name} highlight={debouncedSearch} />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      isTruncatable
                      className="min-w-32 text-sm"
                      title={member.email || member.username}
                    >
                      <HighlightText
                        text={member.email || member.username}
                        highlight={debouncedSearch}
                      />
                    </TableCell>
                    <TableCell>
                      <ProductRoleBadges roles={member.roles} roleDetails={member.roleDetails} />
                    </TableCell>
                    <TableCell variant="action">
                      <div className="flex items-center justify-end gap-2">
                        <PendingInvitationBadge isPending={member.isOrgMembershipPending} />
                        {!isSelf && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton variant="ghost" size="xs" aria-label="Open user actions">
                                <MoreHorizontalIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent sideOffset={2} align="end">
                              <DisabledReasonMenuItem
                                disabledReason={
                                  blockedReason ??
                                  agentVaultMemberActionDeniedReason(permission, member, "edit")
                                }
                                onClick={() => setMemberToEdit(member)}
                              >
                                <PencilIcon />
                                Edit Roles
                              </DisabledReasonMenuItem>
                              <DisabledReasonMenuItem
                                variant="danger"
                                disabledReason={
                                  blockedReason ??
                                  agentVaultMemberActionDeniedReason(permission, member, "remove")
                                }
                                onClick={() => setMemberToRemove(member)}
                              >
                                <Trash2Icon />
                                Remove
                              </DisabledReasonMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      )}

      {totalCount > 0 && (
        <CardContent className="-mt-5 pt-0">
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={(newPerPage) => {
              setPerPage(newPerPage);
              setPage(1);
              setUserTablePreference(
                "agentVaultAccessControlTable",
                PreferenceKey.PerPage,
                newPerPage
              );
            }}
          />
        </CardContent>
      )}

      <InviteMembersDialog isOpen={isInviteOpen} onOpenChange={setIsInviteOpen} />

      <ProductRoleDialog
        member={memberToEdit}
        onOpenChange={() => setMemberToEdit(null)}
        subject={memberToEdit ? memberDisplayName(memberToEdit) : ""}
      />

      <ConfirmationAlertDialog
        isOpen={Boolean(memberToRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setMemberToRemove(null);
        }}
        title={`Remove "${memberToRemove ? memberDisplayName(memberToRemove) : ""}"`}
        description={REMOVE_DESCRIPTION}
        confirmKey={memberToRemove ? memberDisplayName(memberToRemove) : ""}
        confirmLabel="Remove"
        isPending={revokeMembers.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
