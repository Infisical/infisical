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
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useListWorkspaceGroups } from "@app/hooks/api";
import { useRemoveAgentVaultProductMember } from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { AddGroupDialog } from "./AddGroupDialog";
import { ProductRoleDialog } from "./ProductRoleDialog";

type TGroupRow = { id: string; name: string; role: string; customRoleName?: string };

export const GroupsTab = () => {
  const { currentProject } = useProject();
  const { data: groups = [], isPending } = useListWorkspaceGroups(currentProject.id);
  const removeMember = useRemoveAgentVaultProductMember();

  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [groupToEdit, setGroupToEdit] = useState<TGroupRow | null>(null);
  const [groupToRemove, setGroupToRemove] = useState<TGroupRow | null>(null);

  const rows = useMemo<TGroupRow[]>(() => {
    const term = search.trim().toLowerCase();
    return groups
      .map((membership) => ({
        id: membership.group.id,
        name: membership.group.name,
        role: membership.roles?.[0]?.role ?? ProjectMembershipRole.Member,
        customRoleName: membership.roles?.[0]?.customRoleName
      }))
      .filter((row) => row.name.toLowerCase().includes(term));
  }, [groups, search]);

  const handleRemove = async () => {
    if (!groupToRemove) return;
    await removeMember.mutateAsync({ groupId: groupToRemove.id });
    createNotification({
      text: `"${groupToRemove.name}" no longer has access to Agent Vault`,
      type: "success"
    });
    setGroupToRemove(null);
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
            placeholder="Search groups..."
          />
        </InputGroup>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Groups}>
          {(isAllowed) => (
            <Button variant="av" isDisabled={!isAllowed} onClick={() => setIsAddOpen(true)}>
              <PlusIcon />
              Add Group
            </Button>
          )}
        </ProjectPermissionCan>
      </CardContent>

      {!isPending && rows.length === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{search ? "No groups match your search" : "No groups yet"}</EmptyTitle>
              <EmptyDescription>
                {search
                  ? "Try a different search term."
                  : "Add a group to give everyone in it Agent Vault."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Product Role</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`group-skeleton-${index}`}>
                  {Array.from({ length: 3 }).map((__, cell) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`group-skeleton-${index}-${cell}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isPending &&
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <HighlightText text={row.name} highlight={search} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.role === ProjectMembershipRole.Admin ? "av" : "neutral"}>
                      {formatProjectRoleName(row.role, row.customRoleName)}
                    </Badge>
                  </TableCell>
                  <TableCell variant="action">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="xs" aria-label="Open group actions">
                          <MoreHorizontalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent sideOffset={2} align="end">
                        <DropdownMenuItem onClick={() => setGroupToEdit(row)}>
                          <PencilIcon />
                          Change Role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setGroupToRemove(row)}>
                          <Trash2Icon />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}

      <AddGroupDialog isOpen={isAddOpen} onOpenChange={setIsAddOpen} />

      <ProductRoleDialog
        isOpen={Boolean(groupToEdit)}
        onOpenChange={() => setGroupToEdit(null)}
        subject={groupToEdit?.name ?? ""}
        currentRole={groupToEdit?.role ?? ProjectMembershipRole.Member}
        actor={groupToEdit ? { groupId: groupToEdit.id } : {}}
      />

      <DeleteConfirmDialog
        isOpen={Boolean(groupToRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setGroupToRemove(null);
        }}
        title={`Remove "${groupToRemove?.name ?? ""}" from Agent Vault`}
        description="Everyone in the group loses Agent Vault, along with every bundle granted to it."
        confirmKey={groupToRemove?.name ?? ""}
        confirmLabel="Remove"
        isPending={removeMember.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
