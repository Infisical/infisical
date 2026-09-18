import { useState } from "react";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";

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
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import { useListAgentVaultMembers, useRevokeAgentVaultMembers } from "@app/hooks/api/agentVault";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultProductMemberOf } from "@app/hooks/api/agentVault/types";

import { AddGroupDialog } from "./AddGroupDialog";
import { ProductRoleDialog } from "./ProductRoleDialog";

type TGroupMember = TAgentVaultProductMemberOf<AgentVaultMemberType.Group>;

export const GroupsTab = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultGroupsTable", PreferenceKey.PerPage, 20)
  );

  const { data, isPending } = useListAgentVaultMembers({
    actorType: AgentVaultMemberType.Group,
    search: debouncedSearch.trim() || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const revokeMembers = useRevokeAgentVaultMembers();

  const rows = data?.members ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });

  // The debounced term, not the typed one: the rows on screen were fetched with this, so keying the
  // copy off the live input would caption a stale result set.
  const isFiltered = Boolean(debouncedSearch.trim());

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [groupToEdit, setGroupToEdit] = useState<TGroupMember | null>(null);
  const [groupToRemove, setGroupToRemove] = useState<TGroupMember | null>(null);

  const handleRemove = async () => {
    try {
      if (!groupToRemove) return;
      await revokeMembers.mutateAsync({ groupIds: [groupToRemove.actor.id] });
      createNotification({
        text: `"${groupToRemove.actor.name}" removed`,
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
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
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
              <EmptyTitle>
                {isFiltered ? "No groups match your search" : "No groups yet"}
              </EmptyTitle>
              <EmptyDescription>
                {isFiltered
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
              <TableHead isTruncatable className="w-2/3">
                Name
              </TableHead>
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
                  <TableCell isTruncatable className="min-w-32" title={row.actor.name}>
                    <HighlightText text={row.actor.name} highlight={debouncedSearch} />
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
              setUserTablePreference("agentVaultGroupsTable", PreferenceKey.PerPage, newPerPage);
            }}
          />
        </CardContent>
      )}

      <AddGroupDialog isOpen={isAddOpen} onOpenChange={setIsAddOpen} />

      <ProductRoleDialog
        member={groupToEdit}
        onOpenChange={() => setGroupToEdit(null)}
        subject={groupToEdit?.actor.name ?? ""}
      />

      <DeleteConfirmDialog
        isOpen={Boolean(groupToRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setGroupToRemove(null);
        }}
        title={`Remove "${groupToRemove?.actor.name ?? ""}"`}
        description="Everyone in the group loses Agent Vault access, along with every access bundle granted to the group."
        confirmKey={groupToRemove?.actor.name ?? ""}
        confirmLabel="Remove"
        isPending={revokeMembers.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
