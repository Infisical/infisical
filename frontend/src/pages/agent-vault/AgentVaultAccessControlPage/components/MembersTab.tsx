import { useEffect, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";

import { memberDisplayName } from "@app/components/agent-vault/MemberName";
import { PendingInvitationBadge } from "@app/components/agent-vault/PendingInvitationBadge";
import { ProductRoleBadge } from "@app/components/agent-vault/ProductRoleBadge";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { HighlightText } from "@app/components/utilities/HighlightText";
import {
  Button,
  Card,
  CardContent,
  DeleteConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  useUser
} from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import { useListAgentVaultMembers, useRevokeAgentVaultMembers } from "@app/hooks/api/agentVault";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultProductMemberOf } from "@app/hooks/api/agentVault/types";

import { InviteMembersDialog } from "./InviteMembersDialog";
import { ProductRoleDialog } from "./ProductRoleDialog";

type TUserMember = TAgentVaultProductMemberOf<AgentVaultMemberType.User>;

export const MembersTab = () => {
  const { user } = useUser();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultUsersTable", PreferenceKey.PerPage, 20)
  );

  const { data, isPending } = useListAgentVaultMembers({
    actorType: AgentVaultMemberType.User,
    search: debouncedSearch.trim() || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const revokeMembers = useRevokeAgentVaultMembers();

  const filtered = data?.members ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });

  // The debounced term, not the typed one: the rows on screen were fetched with this, so keying the
  // copy off the live input would caption a stale result set.
  const isFiltered = Boolean(debouncedSearch.trim());

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<TUserMember | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TUserMember | null>(null);

  const { permission } = useProjectPermission();
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
      await revokeMembers.mutateAsync({ userIds: [memberToRemove.actor.id] });
      createNotification({
        text: `${memberDisplayName(memberToRemove.actor)} removed`,
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
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search users..."
          />
        </InputGroup>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Member}>
          {(isAllowed) => (
            <Button variant="av" isDisabled={!isAllowed} onClick={() => setIsInviteOpen(true)}>
              <PlusIcon />
              Add Users
            </Button>
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
              <TableHead>Product Role</TableHead>
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
                const isSelf = member.actor.id === user?.id;
                const name = [member.actor.firstName, member.actor.lastName]
                  .filter(Boolean)
                  .join(" ");

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
                      title={member.actor.email || member.actor.username}
                    >
                      <HighlightText
                        text={member.actor.email || member.actor.username}
                        highlight={debouncedSearch}
                      />
                    </TableCell>
                    <TableCell>
                      <ProductRoleBadge role={member.role} />
                    </TableCell>
                    <TableCell variant="action">
                      <div className="flex items-center justify-end gap-2">
                        <PendingInvitationBadge isPending={member.actor.isOrgMembershipPending} />
                        {!isSelf && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton variant="ghost" size="xs" aria-label="Open user actions">
                                <MoreHorizontalIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent sideOffset={2} align="end">
                              <DropdownMenuItem onClick={() => setMemberToEdit(member)}>
                                <PencilIcon />
                                Change Role
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="danger"
                                onClick={() => setMemberToRemove(member)}
                              >
                                <Trash2Icon />
                                Remove
                              </DropdownMenuItem>
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
        // The card lays its children out with gap-5, which reads as a gap under the table.
        <CardContent className="-mt-5 pt-0">
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={(newPerPage) => {
              setPerPage(newPerPage);
              setPage(1);
              setUserTablePreference("agentVaultUsersTable", PreferenceKey.PerPage, newPerPage);
            }}
          />
        </CardContent>
      )}

      <InviteMembersDialog isOpen={isInviteOpen} onOpenChange={setIsInviteOpen} />

      <ProductRoleDialog
        member={memberToEdit}
        onOpenChange={() => setMemberToEdit(null)}
        subject={memberToEdit ? memberDisplayName(memberToEdit.actor) : ""}
      />

      <DeleteConfirmDialog
        isOpen={Boolean(memberToRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setMemberToRemove(null);
        }}
        title={`Remove "${memberToRemove ? memberDisplayName(memberToRemove.actor) : ""}"`}
        description="They lose every access bundle granted to them. Any active session they hold stops reaching its hosts at the next proxy poll."
        confirmKey={memberToRemove ? memberDisplayName(memberToRemove.actor) : ""}
        confirmLabel="Remove"
        isPending={revokeMembers.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
