import { useMemo, useState } from "react";
import { ArrowRightIcon, PencilIcon, UserRoundXIcon } from "lucide-react";

import { FilterBar } from "@app/components/v4/patterns/filter-bar";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TGroupMembership } from "@app/hooks/api/groups/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { OrgAccessControlTabSections } from "@app/types/org";

import { useV4Adapter } from "../../../data/adapters";
import { accessLinks } from "../../links";
import { useGo } from "../../navigation";
import { useOrgId, useProjectPermission } from "../../permissions";
import { useProjectScope } from "../../project/scope";
import { formatDate } from "../../roles";
import { failed, saved } from "../../toast";
import { Gate, Muted, RESTRICTED, RoleBadges, usePagedList } from "../../ui";
import { ProductRemoveDialog, ProductRoleDialog, ProductRoleField } from "./product-dialogs";

const GROUP_PAGE_SIZE = 100;

const AddGroupDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const go = useGo();
  const orgId = useOrgId();
  const { projectId, projectType } = useProjectScope();
  const access = useV4Adapter("access");
  const addGroup = useV4Adapter("pam").useAddProductGroupMember();
  const orgGroups = access.useOrgGroups({ organizationId: orgId, limit: GROUP_PAGE_SIZE });
  const projectGroups = access.useProjectGroups(projectId, projectType);
  const [groupId, setGroupId] = useState("");
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);
  const [pending, setPending] = useState(false);

  const loading = orgGroups.isPending || projectGroups.isPending;
  const assigned = new Set((projectGroups.data ?? []).map((membership) => membership.group.id));
  const available = (orgGroups.data?.groups ?? []).filter((group) => !assigned.has(group.id));

  const close = () => {
    setGroupId("");
    setRole(ProjectMembershipRole.Member);
    onOpenChange(false);
  };

  const submit = async () => {
    setPending(true);
    try {
      await addGroup.mutateAsync({ projectId, groupId, role });
      saved("Group added");
      close();
    } catch (error) {
      failed("Failed to add group", error);
    } finally {
      setPending(false);
    }
  };

  let body = (
    <form
      id="add-pam-group"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Stack gap={16}>
        <Field label="Group">
          <Combobox
            label="Group"
            placeholder="Select group..."
            emptyText="No groups match your search"
            options={available.map((group) => ({ value: group.id, label: group.name }))}
            value={groupId}
            onChange={setGroupId}
          />
        </Field>
        <Field label="Product role">
          <ProductRoleField id="pam-add-group-role" value={role} onChange={setRole} />
        </Field>
      </Stack>
    </form>
  );
  let footer = (
    <>
      <Button variant="ghost" onClick={close}>
        Cancel
      </Button>
      <Button
        variant="primary"
        type="submit"
        form="add-pam-group"
        loading={pending}
        disabled={!groupId}
      >
        Add group
      </Button>
    </>
  );
  if (loading) {
    body = <Skeleton width="100%" height={32} role="status" aria-label="Loading groups" />;
  } else if (!available.length) {
    body = (
      <Muted>
        All organization groups have already been added. Create a new group at the organization
        level first.
      </Muted>
    );
    footer = (
      <Button
        variant="outline"
        onClick={() => {
          close();
          go(accessLinks.org(orgId, OrgAccessControlTabSections.Groups));
        }}
      >
        Go to organization groups
        <Icon icon={ArrowRightIcon} />
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Add group</DialogTitle>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const PamGroupsTab = () => {
  const go = useGo();
  const scope = useProjectScope();
  const { projectId } = scope;
  const pam = useV4Adapter("pam");
  const { permission } = useProjectPermission(projectId);
  const groups = useV4Adapter("access").useProjectGroups(projectId, scope.projectType);
  const updateGroup = pam.useUpdateProductGroupMember();
  const removeGroup = pam.useRemoveProductGroupMember();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TGroupMembership>();
  const [removing, setRemoving] = useState<TGroupMembership>();

  const canCreate = permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Groups);
  const canEdit = permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Groups);
  const canDelete = permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Groups);

  const rows = useMemo(() => groups.data ?? [], [groups.data]);
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (row, needle) =>
      row.group.name.toLowerCase().includes(needle) ||
      row.group.slug.toLowerCase().includes(needle),
    compare: (a, b, column) =>
      column === "added"
        ? new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
        : a.group.name.toLowerCase().localeCompare(b.group.name.toLowerCase())
  });

  const columns: DataTableColumn<TGroupMembership>[] = [
    {
      id: "name",
      header: "Group",
      sortable: true,
      grow: true,
      render: (row) => (
        <RowLink
          link={go.link(accessLinks.projectGroup(scope, row.group.id))}
          title={row.group.name}
        >
          {row.group.name}
        </RowLink>
      )
    },
    {
      id: "role",
      header: "Product role",
      render: (row) => <RoleBadges roles={row.roles} />
    },
    {
      id: "added",
      header: "Added on",
      sortable: true,
      render: (row) => <span>{formatDate(row.createdAt)}</span>
    }
  ];

  const rowActions: DataTableRowActions<TGroupMembership> = {
    renderMenu: (row) => (
      <>
        <DropdownMenuItem
          disabled={!canEdit}
          description={canEdit ? undefined : RESTRICTED}
          onSelect={() => setEditing(row)}
        >
          <Icon icon={PencilIcon} />
          Edit product role
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          description={canDelete ? undefined : RESTRICTED}
          onSelect={() => setRemoving(row)}
        >
          <Icon icon={UserRoundXIcon} />
          Remove group
        </DropdownMenuItem>
      </>
    )
  };

  const remove = async () => {
    const group = removing;
    setRemoving(undefined);
    if (!group) return;
    try {
      await removeGroup.mutateAsync({ projectId, groupId: group.group.id });
      saved("Group removed");
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
          <Gate allowed={canCreate} reason="You don't have permission to add groups">
            <Button
              variant="accent"
              icon="plus"
              disabled={!canCreate}
              onClick={() => setAdding(true)}
            >
              Add group
            </Button>
          </Gate>
        }
      />
      <DataTable
        label="Groups"
        rows={list.pageRows}
        columns={columns}
        rowActions={rowActions}
        getRowId={(row) => row.group.id}
        rowLabel={(row) => row.group.name}
        loading={groups.isPending}
        loadingRows={10}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          (Boolean(groups.error) && (
            <EmptyState size="sm" icon="alert" title="Couldn't load groups" />
          )) ||
          (list.search.trim() ? (
            <EmptyState size="sm" icon="search" title="No groups match search" />
          ) : (
            <EmptyState size="sm" icon="user" title="No groups found" />
          ))
        }
        pagination={groups.isPending ? undefined : list.pagination}
      />
      <AddGroupDialog open={adding} onOpenChange={setAdding} />
      <ProductRoleDialog
        key={editing?.group.id}
        open={Boolean(editing)}
        onOpenChange={(next) => !next && setEditing(undefined)}
        name={editing?.group.name ?? ""}
        currentRole={editing?.roles[0]?.role ?? ProjectMembershipRole.Member}
        onSave={(role) =>
          updateGroup.mutateAsync({ projectId, groupId: editing?.group.id ?? "", role })
        }
        successMessage="Group role updated"
        failureMessage="Failed to update group role"
      />
      <ProductRemoveDialog
        open={Boolean(removing)}
        onOpenChange={(next) => !next && setRemoving(undefined)}
        title={`Remove ${removing?.group.name ?? "group"}?`}
        description="Members lose access granted through this group."
        confirmText="remove"
        actionLabel="Remove group"
        onConfirm={remove}
      />
    </Stack>
  );
};
