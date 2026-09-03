import { useMemo, useState } from "react";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { HighlightText } from "@app/components/v2/HighlightText";
import {
  Badge,
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
import { ProjectPermissionActions, ProjectPermissionSub, useProject, useUser } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useGetWorkspaceUsers } from "@app/hooks/api";
import { useRemoveAgentVaultProductMember } from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

import { InviteMembersDialog } from "./InviteMembersDialog";
import { PendingInvitationBadge } from "./PendingInvitationBadge";
import { ProductRoleDialog } from "./ProductRoleDialog";

const displayName = (member: TWorkspaceUser) => {
  const full = `${member.user.firstName ?? ""} ${member.user.lastName ?? ""}`.trim();
  return full || member.user.username || member.inviteEmail || "";
};

export const MembersTab = () => {
  const { currentProject } = useProject();
  const { user } = useUser();
  const { data: members = [], isPending } = useGetWorkspaceUsers(currentProject.id);
  const removeMember = useRemoveAgentVaultProductMember();

  const [search, setSearch] = useState("");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<TWorkspaceUser | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TWorkspaceUser | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (member) =>
        displayName(member).toLowerCase().includes(term) ||
        (member.user.email ?? "").toLowerCase().includes(term) ||
        (member.inviteEmail ?? "").toLowerCase().includes(term)
    );
  }, [members, search]);

  const handleRemove = async () => {
    if (!memberToRemove) return;
    await removeMember.mutateAsync({ userId: memberToRemove.user.id });
    createNotification({
      text: `${displayName(memberToRemove)} no longer has access to Agent Vault`,
      type: "success"
    });
    setMemberToRemove(null);
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
            placeholder="Search members..."
          />
        </InputGroup>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Member}>
          {(isAllowed) => (
            <Button variant="av" isDisabled={!isAllowed} onClick={() => setIsInviteOpen(true)}>
              <PlusIcon />
              Add Members
            </Button>
          )}
        </ProjectPermissionCan>
      </CardContent>

      {!isPending && filtered.length === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{search ? "No members match your search" : "No members yet"}</EmptyTitle>
              <EmptyDescription>
                {search ? "Try a different search term." : "Add members to give them Agent Vault."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
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
                const role = member.roles?.[0]?.role ?? ProjectMembershipRole.Member;
                const isSelf = member.user.id === user?.id;

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-x-1.5">
                        <HighlightText text={displayName(member)} highlight={search} />
                        <PendingInvitationBadge isPending={member.user.isOrgMembershipPending} />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <HighlightText
                        text={member.user.email || member.inviteEmail || member.user.username || ""}
                        highlight={search}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={role === ProjectMembershipRole.Admin ? "av" : "neutral"}>
                        {formatProjectRoleName(role, member.roles?.[0]?.customRoleName)}
                      </Badge>
                    </TableCell>
                    <TableCell variant="action">
                      {!isSelf && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton variant="ghost" size="xs" aria-label="Open member actions">
                              <MoreHorizontalIcon />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent sideOffset={2} align="end">
                            <DropdownMenuItem onClick={() => setMemberToEdit(member)}>
                              <PencilIcon />
                              Change Role
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setMemberToRemove(member)}>
                              <Trash2Icon />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
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
        currentRole={memberToEdit?.roles?.[0]?.role ?? ProjectMembershipRole.Member}
        actor={memberToEdit ? { userId: memberToEdit.user.id } : {}}
      />

      <DeleteConfirmDialog
        isOpen={Boolean(memberToRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setMemberToRemove(null);
        }}
        title={`Remove "${memberToRemove ? displayName(memberToRemove) : ""}" from Agent Vault`}
        description="They lose every access bundle granted to them, and any live session stops reaching its hosts at the next proxy poll."
        confirmKey={memberToRemove ? displayName(memberToRemove) : ""}
        confirmLabel="Remove"
        isPending={removeMember.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
