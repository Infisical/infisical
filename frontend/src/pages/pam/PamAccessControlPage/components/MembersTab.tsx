import { useMemo, useState } from "react";
import { MoreHorizontalIcon, PencilIcon, Plus, SearchIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { useRemovePamProductUserMember } from "@app/hooks/api/pam";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

import { InviteMemberModal } from "./InviteMemberModal";
import { MemberRoleModal } from "./MemberRoleModal";

export const MembersTab = () => {
  const { currentProject } = useProject();
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<TWorkspaceUser | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TWorkspaceUser | null>(null);

  const { data: members = [], isPending } = useGetWorkspaceUsers(currentProject.id);
  const deleteMember = useRemovePamProductUserMember();

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
    await deleteMember.mutateAsync({
      projectId: currentProject.id,
      userId: memberToRemove.user.id
    });
    createNotification({ text: "Member removed", type: "success" });
    setMemberToRemove(null);
  };

  const getPrimaryRole = (member: TWorkspaceUser) => {
    const role = member.roles?.[0];
    if (!role) return ProjectMembershipRole.Member;
    return role.role;
  };

  const getDisplayName = (member: TWorkspaceUser) =>
    member.user.firstName || member.user.lastName
      ? `${member.user.firstName ?? ""} ${member.user.lastName ?? ""}`.trim()
      : member.user.username || member.inviteEmail;

  return (
    <div>
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
              <Button variant="pam" isDisabled={!isAllowed} onClick={() => setIsInviteOpen(true)}>
                <Plus className="size-4" />
                Invite Member
              </Button>
            )}
          </ProjectPermissionCan>
        </CardContent>

        {!isPending && filteredMembers.length === 0 ? (
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {search ? "No members match your search" : "No members found"}
                </EmptyTitle>
                <EmptyDescription>
                  {search ? "Try a different search term." : "Invite members to get started."}
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
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      <HighlightText text={getDisplayName(member) ?? ""} highlight={search} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <HighlightText
                        text={member.user.email || member.inviteEmail || ""}
                        highlight={search}
                      />
                    </TableCell>
                    <TableCell>
                      <button type="button" onClick={() => setSelectedMember(member)}>
                        <Badge variant={role === ProjectMembershipRole.Admin ? "pam" : "neutral"}>
                          {formatProjectRoleName(role, member.roles?.[0]?.customRoleName)}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell>
                      {!isSelf && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              variant="ghost"
                              size="xs"
                              aria-label="Member actions"
                              className="text-muted"
                            >
                              <MoreHorizontalIcon className="size-4" />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Edit}
                              a={ProjectPermissionSub.Member}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  isDisabled={!isAllowed}
                                  onClick={() => setSelectedMember(member)}
                                >
                                  <PencilIcon />
                                  Edit
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                            <DropdownMenuSeparator />
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Delete}
                              a={ProjectPermissionSub.Member}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  variant="danger"
                                  isDisabled={!isAllowed}
                                  onClick={() => setMemberToRemove(member)}
                                >
                                  <Trash2Icon />
                                  Remove
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
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
      </Card>

      <MemberRoleModal
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
