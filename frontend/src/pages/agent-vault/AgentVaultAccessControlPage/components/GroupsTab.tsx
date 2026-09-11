import { useMemo, useState } from "react";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";

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
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import {
  useListAgentVaultProductGroupMembers,
  useRemoveAgentVaultProductMember
} from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { AddGroupDialog } from "./AddGroupDialog";
import { ProductRoleDialog } from "./ProductRoleDialog";

type TGroupRow = { id: string; name: string; role: string };

export const GroupsTab = () => {
  const { data: groups = [], isPending } = useListAgentVaultProductGroupMembers();
  const removeMember = useRemoveAgentVaultProductMember();

  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [groupToEdit, setGroupToEdit] = useState<TGroupRow | null>(null);
  const [groupToRemove, setGroupToRemove] = useState<TGroupRow | null>(null);

  const rows = useMemo<TGroupRow[]>(() => {
    const term = search.trim().toLowerCase();
    return groups
      .filter((membership) => membership.groupId)
      .map((membership) => ({
        id: membership.groupId as string,
        name: membership.name,
        role: membership.role
      }))
      .filter((row) => row.name.toLowerCase().includes(term));
  }, [groups, search]);

  const handleRemove = async () => {
    try {
      if (!groupToRemove) return;
      await removeMember.mutateAsync({ groupId: groupToRemove.id });
      createNotification({
        text: `"${groupToRemove.name}" removed`,
        type: "success"
      });
      setGroupToRemove(null);
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
                  : "Add a group to give everyone in it access."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead isTruncatable>Name</TableHead>
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
                  <TableCell isTruncatable className="min-w-32" title={row.name}>
                    <HighlightText text={row.name} highlight={search} />
                  </TableCell>
                  <TableCell>
                    <ProductRoleBadge role={row.role} />
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
                        <DropdownMenuItem variant="danger" onClick={() => setGroupToRemove(row)}>
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
        title={`Remove "${groupToRemove?.name ?? ""}"`}
        description="Everyone in the group loses access, along with every bundle granted to it."
        confirmKey={groupToRemove?.name ?? ""}
        confirmLabel="Remove"
        isPending={removeMember.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
