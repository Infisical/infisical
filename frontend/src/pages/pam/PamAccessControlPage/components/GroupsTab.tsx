import { useMemo, useState } from "react";
import { format } from "date-fns";
import { MoreHorizontalIcon, Plus, SearchIcon, Trash2Icon } from "lucide-react";

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
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useDeleteGroupFromWorkspace, useListWorkspaceGroups } from "@app/hooks/api";
import { TGroupMembership } from "@app/hooks/api/groups/types";

import { AddGroupModal } from "./AddGroupModal";
import { GroupDetailSheet } from "./GroupDetailSheet";

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
    try {
      await deleteGroup.mutateAsync({
        projectId: currentProject.id,
        groupId: groupToRemove.group.id
      });
      createNotification({ text: "Group removed from project", type: "success" });
    } catch {
      createNotification({ text: "Failed to remove group", type: "error" });
    } finally {
      setGroupToRemove(null);
    }
  };

  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {filteredGroups.length} group{filteredGroups.length !== 1 ? "s" : ""}
        </p>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Groups}>
          {(isAllowed) => (
            <Button
              variant="pam"
              size="sm"
              isDisabled={!isAllowed}
              onClick={() => setIsAddGroupOpen(true)}
            >
              <Plus className="mr-1 size-4" />
              Add Group
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
            placeholder="Search groups..."
          />
        </InputGroup>
      </div>
      {!isPending && filteredGroups.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{search ? "No groups match your search" : "No groups found"}</EmptyTitle>
            <EmptyDescription>
              {search ? "Try a different search term." : "Add groups to manage access."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
              const primaryRole = roles?.[0]?.role ?? "member";
              return (
                <TableRow key={id} onClick={() => setSelectedGroup(membership)}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>
                    <Badge variant={primaryRole === "admin" ? "pam" : "neutral"}>
                      {formatProjectRoleName(primaryRole, roles?.[0]?.customRoleName)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted">
                    {createdAt ? format(new Date(createdAt), "MMM d, yyyy") : "-"}
                  </TableCell>
                  <TableCell>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Delete}
                      a={ProjectPermissionSub.Groups}
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
                                setGroupToRemove(membership);
                              }}
                            >
                              <Trash2Icon className="mr-2 size-4" />
                              Remove from project
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </ProjectPermissionCan>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <AddGroupModal isOpen={isAddGroupOpen} onOpenChange={setIsAddGroupOpen} />

      <GroupDetailSheet
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
        title={`Remove ${groupToRemove?.group.name ?? "group"} from the project?`}
        deleteKey="remove"
        buttonText="Remove"
        onDeleteApproved={handleDeleteGroup}
      />
    </div>
  );
};
