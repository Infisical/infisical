import { useMemo, useState } from "react";
import { MoreHorizontalIcon, Plus, SearchIcon, UserXIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Badge,
  Button,
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
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useUser
} from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useDeleteUserFromWorkspace, useGetWorkspaceUsers } from "@app/hooks/api";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

import { InviteMemberModal } from "./InviteMemberModal";
import { MemberDetailSheet } from "./MemberDetailSheet";

export const MembersTab = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<TWorkspaceUser | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TWorkspaceUser | null>(null);

  const { data: members = [], isPending } = useGetWorkspaceUsers(currentProject.id);
  const deleteMember = useDeleteUserFromWorkspace();

  const filteredMembers = useMemo(
    () =>
      members.filter(
        ({ user: u, inviteEmail }) =>
          u?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
          u?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
          u?.email?.toLowerCase().includes(search.toLowerCase()) ||
          inviteEmail?.toLowerCase().includes(search.toLowerCase())
      ),
    [members, search]
  );

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    try {
      await deleteMember.mutateAsync({
        projectId: currentProject.id,
        usernames: [memberToRemove.user.username],
        orgId: currentOrg.id
      });
      createNotification({ text: "Member removed", type: "success" });
    } catch {
      createNotification({ text: "Failed to remove member", type: "error" });
    } finally {
      setMemberToRemove(null);
    }
  };

  const getPrimaryRole = (member: TWorkspaceUser) => {
    const role = member.roles?.[0];
    if (!role) return "member";
    return role.role;
  };

  const getDisplayName = (member: TWorkspaceUser) =>
    member.user.firstName || member.user.lastName
      ? `${member.user.firstName ?? ""} ${member.user.lastName ?? ""}`.trim()
      : member.user.username || member.inviteEmail;

  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {filteredMembers.length} member{filteredMembers.length !== 1 ? "s" : ""}
        </p>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Member}>
          {(isAllowed) => (
            <Button
              variant="pam"
              size="sm"
              isDisabled={!isAllowed}
              onClick={() => setIsInviteOpen(true)}
            >
              <Plus className="mr-1 size-4" />
              Invite Member
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="mb-4">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members..."
          />
        </InputGroup>
      </div>
      {!isPending && filteredMembers.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{search ? "No members match your search" : "No members found"}</EmptyTitle>
            <EmptyDescription>
              {search ? "Try a different search term." : "Invite members to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Product Role</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i + 1}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}
            {filteredMembers.map((member) => {
              const role = getPrimaryRole(member);
              const isSelf = member.user.id === user?.id;

              return (
                <TableRow key={member.id} onClick={() => setSelectedMember(member)}>
                  <TableCell className="font-medium">{getDisplayName(member)}</TableCell>
                  <TableCell className="font-mono text-sm text-muted">
                    {member.user.email || member.inviteEmail}
                  </TableCell>
                  <TableCell>
                    <Badge variant={role === "admin" ? "pam" : "neutral"}>
                      {formatProjectRoleName(role, member.roles?.[0]?.customRoleName)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!isSelf && (
                      <ProjectPermissionCan
                        I={ProjectPermissionActions.Delete}
                        a={ProjectPermissionSub.Member}
                      >
                        {(isAllowed) => (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                variant="outline"
                                size="sm"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontalIcon className="size-4" />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMemberToRemove(member);
                                }}
                              >
                                <UserXIcon className="mr-2 size-4" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </ProjectPermissionCan>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <MemberDetailSheet
        member={selectedMember}
        isOpen={!!selectedMember}
        onOpenChange={(open) => {
          if (!open) setSelectedMember(null);
        }}
      />

      <InviteMemberModal isOpen={isInviteOpen} onOpenChange={setIsInviteOpen} />

      <DeleteActionModal
        isOpen={!!memberToRemove}
        onChange={(isOpen) => {
          if (!isOpen) setMemberToRemove(null);
        }}
        title={`Remove ${memberToRemove ? getDisplayName(memberToRemove) : "member"}?`}
        deleteKey="remove"
        buttonText="Remove"
        onDeleteApproved={handleRemoveMember}
      />
    </div>
  );
};
