import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";

import { PendingInvitationBadge } from "@app/components/agent-vault/PendingInvitationBadge";
import { ProductRoleBadge } from "@app/components/agent-vault/ProductRoleBadge";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { HighlightText } from "@app/components/v2/HighlightText";
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
  useListAgentVaultProductUserMembers,
  useRemoveAgentVaultProductMember
} from "@app/hooks/api/agentVault";
import { TAgentVaultProductUserMember } from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { InviteMembersDialog } from "./InviteMembersDialog";
import { ProductRoleDialog } from "./ProductRoleDialog";

const fullName = (member: TAgentVaultProductUserMember) =>
  `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim();

const displayName = (member: TAgentVaultProductUserMember) =>
  fullName(member) || member.username || member.email || "";

export const MembersTab = () => {
  const { user } = useUser();
  const { data: members = [], isPending } = useListAgentVaultProductUserMembers();
  const removeMember = useRemoveAgentVaultProductMember();

  const [search, setSearch] = useState("");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<TAgentVaultProductUserMember | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TAgentVaultProductUserMember | null>(null);

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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (member) =>
        displayName(member).toLowerCase().includes(term) ||
        (member.email ?? "").toLowerCase().includes(term)
    );
  }, [members, search]);

  const handleRemove = async () => {
    try {
      if (!memberToRemove?.userId) return;
      await removeMember.mutateAsync({ userId: memberToRemove.userId });
      createNotification({
        text: `${displayName(memberToRemove)} removed`,
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
              <EmptyTitle>{search ? "No users match your search" : "No users yet"}</EmptyTitle>
              <EmptyDescription>
                {search ? "Try a different search term." : "Add users to give them access."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead isTruncatable>Name</TableHead>
              <TableHead isTruncatable>Email</TableHead>
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
                const isSelf = member.userId === user?.id;
                const name = fullName(member);

                return (
                  <TableRow key={member.membershipId}>
                    <TableCell isTruncatable className="min-w-32" title={name || undefined}>
                      {name ? (
                        <HighlightText text={name} highlight={search} />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      isTruncatable
                      className="min-w-32 text-sm"
                      title={member.email || member.username}
                    >
                      <HighlightText text={member.email || member.username} highlight={search} />
                    </TableCell>
                    <TableCell>
                      <ProductRoleBadge role={member.role} />
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

      <InviteMembersDialog isOpen={isInviteOpen} onOpenChange={setIsInviteOpen} />

      <ProductRoleDialog
        isOpen={Boolean(memberToEdit)}
        onOpenChange={() => setMemberToEdit(null)}
        subject={memberToEdit ? displayName(memberToEdit) : ""}
        currentRole={memberToEdit?.role ?? ProjectMembershipRole.Member}
        actor={memberToEdit?.userId ? { userId: memberToEdit.userId } : {}}
      />

      <DeleteConfirmDialog
        isOpen={Boolean(memberToRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setMemberToRemove(null);
        }}
        title={`Remove "${memberToRemove ? displayName(memberToRemove) : ""}"`}
        description="They lose every access bundle granted to them, and any live session stops reaching its hosts at the next proxy poll."
        confirmKey={memberToRemove ? displayName(memberToRemove) : ""}
        confirmLabel="Remove"
        isPending={removeMember.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
