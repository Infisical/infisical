import { useState } from "react";
import { UserRoundXIcon } from "lucide-react";

import { FilterBar } from "@app/components/v4/patterns/filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultProductMemberOf } from "@app/hooks/api/agentVault/types";

import { useV4Adapter } from "../../../data/adapters";
import { useProjectPermission } from "../../permissions";
import { useProjectScope } from "../../project/scope";
import { failed, saved } from "../../toast";
import { Gate } from "../../ui";
import { AddGroupDialog } from "./groups-add-dialog";
import { ChangeRoleDialog, ProductRoleBadge, useMemberList } from "./shared";

type GroupMember = TAgentVaultProductMemberOf<AgentVaultMemberType.Group>;

export const AgentVaultGroupsTab = () => {
  const { projectId } = useProjectScope();
  const { permission } = useProjectPermission(projectId);
  const revoke = useV4Adapter("agentVault").useRevokeMembers(projectId);
  const list = useMemberList(projectId, AgentVaultMemberType.Group);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GroupMember>();
  const [removing, setRemoving] = useState<GroupMember>();

  const canAdd = permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Groups);

  const columns: DataTableColumn<GroupMember>[] = [
    {
      id: "name",
      header: "Name",
      grow: true,
      render: (group) => <span title={group.name}>{group.name}</span>
    },
    {
      id: "role",
      header: "Product role",
      render: (group) => <ProductRoleBadge role={group.role} />
    }
  ];

  const remove = async () => {
    const group = removing;
    setRemoving(undefined);
    if (!group) return;
    try {
      await revoke.mutateAsync({ groupIds: [group.id] });
      saved(`${group.name} removed`);
    } catch (error) {
      failed("Failed to remove group", error);
    }
  };

  return (
    <Stack gap={16}>
      <FilterBar
        label="Group filters"
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label="Search groups..."
            placeholder="Search groups..."
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
        }
        actions={
          <Gate allowed={canAdd}>
            <Button variant="accent" icon="plus" disabled={!canAdd} onClick={() => setAdding(true)}>
              Add group
            </Button>
          </Gate>
        }
      />
      <DataTable
        label="Groups"
        rows={list.rows}
        columns={columns}
        rowActions={{
          renderMenu: (group) => (
            <>
              <DropdownMenuItem onSelect={() => setEditing(group)}>
                <Icon name="user" />
                Change role
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(group)}>
                <Icon icon={UserRoundXIcon} />
                Remove
              </DropdownMenuItem>
            </>
          )
        }}
        getRowId={(group) => group.id}
        rowLabel={(group) => group.name}
        loading={list.isPending}
        loadingRows={10}
        empty={
          list.searching ? (
            <EmptyState size="sm" icon="search" title="No groups match search" />
          ) : (
            <EmptyState size="sm" icon="user" title="No groups yet" />
          )
        }
        pagination={list.pagination}
      />
      <AddGroupDialog projectId={projectId} open={adding} onOpenChange={setAdding} />
      <ChangeRoleDialog
        projectId={projectId}
        member={editing}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={removing?.name ?? ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove ${removing?.name ?? "group"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone in the group loses access to this project, along with every access bundle
              granted to the group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Remove group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
