import { useMemo, useState } from "react";
import { format } from "date-fns";
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
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useDeleteGroupFromWorkspace, useListWorkspaceGroups } from "@app/hooks/api";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { AddGroupModal } from "./AddGroupModal";
import { GroupRoleModal } from "./GroupRoleModal";

export const GroupsTab = () => {
  const { currentProject } = useProject();
  const [search, setSearch] = useState("");
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<TGroupMembership | null>(null);
  const [groupToRemove, setGroupToRemove] = useState<TGroupMembership | null>(null);

  const { data: groups = [], isPending } = useListWorkspaceGroups(currentProject.id);
  const deleteGroup = useDeleteGroupFromWorkspace();

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        ({ group }) =>
          group.name.toLowerCase().includes(search.toLowerCase()) ||
          group.slug.toLowerCase().includes(search.toLowerCase())
      ),
    [groups, search]
  );

  const handleDeleteGroup = async () => {
    if (!groupToRemove) return;
    await deleteGroup.mutateAsync({
      projectId: currentProject.id,
      groupId: groupToRemove.group.id
    });
    createNotification({ text: "Group removed", type: "success" });
    setGroupToRemove(null);
  };

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
              placeholder="Search groups..."
            />
          </InputGroup>
          <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Groups}>
            {(isAllowed) => (
              <Button variant="pam" isDisabled={!isAllowed} onClick={() => setIsAddGroupOpen(true)}>
                <Plus className="mr-1 size-4" />
                Add Group
              </Button>
            )}
          </ProjectPermissionCan>
        </CardContent>

        {!isPending && filteredGroups.length === 0 ? (
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {search ? "No groups match your search" : "No groups found"}
                </EmptyTitle>
                <EmptyDescription>
                  {search ? "Try a different search term." : "Add groups to manage access."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Added</TableHead>
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
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              {filteredGroups.map((membership) => {
                const { id, group, roles, createdAt } = membership;
                const primaryRole = roles?.[0]?.role ?? ProjectMembershipRole.Member;
                return (
                  <TableRow key={id}>
                    <TableCell className="font-medium">
                      <HighlightText text={group.name} highlight={search} />
                    </TableCell>
                    <TableCell>
                      <button type="button" onClick={() => setSelectedGroup(membership)}>
                        <Badge
                          variant={primaryRole === ProjectMembershipRole.Admin ? "pam" : "neutral"}
                        >
                          {formatProjectRoleName(primaryRole, roles?.[0]?.customRoleName)}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted">
                      {createdAt ? format(new Date(createdAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label="Group actions"
                            className="text-muted"
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.Groups}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => setSelectedGroup(membership)}
                              >
                                <PencilIcon />
                                Edit
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <DropdownMenuSeparator />
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.Groups}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                variant="danger"
                                isDisabled={!isAllowed}
                                onClick={() => setGroupToRemove(membership)}
                              >
                                <Trash2Icon />
                                Remove
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <AddGroupModal isOpen={isAddGroupOpen} onOpenChange={setIsAddGroupOpen} />

      <GroupRoleModal
        group={selectedGroup}
        isOpen={!!selectedGroup}
        onOpenChange={(open) => {
          if (!open) setSelectedGroup(null);
        }}
      />

      <DeleteActionModal
        isOpen={!!groupToRemove}
        onChange={(isOpen) => {
          if (!isOpen) setGroupToRemove(null);
        }}
        title={`Remove ${groupToRemove?.group.name ?? "group"}?`}
        deleteKey="remove"
        buttonText="Remove"
        onDeleteApproved={handleDeleteGroup}
      />
    </div>
  );
};
