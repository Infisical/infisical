import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";

import { FilterBar } from "@app/components/v4/patterns/filter-bar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { RowLink } from "@app/components/v4/ui/row-link";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Tabs } from "@app/components/v4/ui/tabs";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { UNIVERSAL_AUTH_DEFAULTS } from "@app/hooks/api/identities/constants";
import { SearchIdentitiesScope } from "@app/hooks/api/identities/types";
import { pamKeys, type TPamIdentityMember } from "@app/hooks/api/pam";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { useV4Adapter } from "../../../data/adapters";
import { accessLinks } from "../../links";
import { useGo } from "../../navigation";
import { useProjectPermission } from "../../permissions";
import { useProjectScope } from "../../project/scope";
import { builtInProjectRoleName, formatDate } from "../../roles";
import { failed, saved, toast } from "../../toast";
import { Gate, Muted, RESTRICTED, usePagedList } from "../../ui";
import { ProductRemoveDialog, ProductRoleDialog, ProductRoleField } from "./product-dialogs";

type AddMode = "create" | "assign";

const isPamManaged = (member: TPamIdentityMember, projectId: string) =>
  member.identityProjectId === projectId;

const AddIdentityForm = ({
  existing,
  pending,
  setPending,
  onClose
}: {
  existing: readonly TPamIdentityMember[];
  pending: boolean;
  setPending: (pending: boolean) => void;
  onClose: () => void;
}) => {
  const go = useGo();
  const scope = useProjectScope();
  const { orgId, projectId } = scope;
  const access = useV4Adapter("access");
  const addMember = useV4Adapter("pam").useAddProductIdentityMember();
  const { data: orgIdentities } = access.useSearchOrgIdentities({
    orgId,
    offset: 0,
    limit: 100,
    scope: [SearchIdentitiesScope.OrganizationScope],
    search: {}
  });
  const createIdentity = access.useCreateProjectManagedIdentity();
  const addUniversalAuth = access.useAddIdentityUniversalAuth();

  const assignable = useMemo(() => {
    const taken = new Set(existing.map((member) => member.identityId));
    return (orgIdentities?.identities ?? []).filter((row) => !taken.has(row.identity.id));
  }, [orgIdentities, existing]);

  const [mode, setMode] = useState<AddMode>();
  const currentMode = mode ?? (assignable.length > 0 ? "assign" : "create");
  const [name, setName] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);
  const [errors, setErrors] = useState<{ name?: string; identity?: string }>({});

  const submit = async () => {
    if (currentMode === "create" && !name.trim()) {
      setErrors({ name: "Required" });
      return;
    }
    if (currentMode === "assign" && !identityId) {
      setErrors({ identity: "Required" });
      return;
    }
    setPending(true);
    try {
      if (currentMode === "assign") {
        await addMember.mutateAsync({ projectId, identityId, role });
        saved("Successfully added machine identity");
        onClose();
        return;
      }
      const created = await createIdentity.mutateAsync({
        projectId,
        name: name.trim(),
        hasDeleteProtection: true,
        roles: [{ role }]
      });
      try {
        await addUniversalAuth.mutateAsync({
          projectId,
          identityId: created.id,
          ...UNIVERSAL_AUTH_DEFAULTS
        });
        saved("Successfully created machine identity");
      } catch {
        toast({
          tone: "bad",
          title: "Machine identity created, but attaching Universal Auth failed",
          description: "Add an auth method from the identity page."
        });
      }
      onClose();
      go(accessLinks.projectIdentity(scope, created.id));
    } catch (error) {
      failed(
        currentMode === "assign"
          ? "Failed to add machine identity"
          : "Failed to create machine identity",
        error
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <SheetBody>
        <form
          id="add-pam-identity"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Stack gap={8}>
              <Tabs
                variant="segmented"
                label="Identity assignment mode"
                value={currentMode}
                onChange={(next) => {
                  setMode(next as AddMode);
                  setErrors({});
                  if (next === "create") setIdentityId("");
                  else setName("");
                }}
                tabs={[
                  { value: "create", label: "Create new" },
                  { value: "assign", label: "Assign existing" }
                ]}
              />
              <Muted>
                {currentMode === "assign"
                  ? "Reuse an organization machine identity across products."
                  : "Creates a machine identity that belongs to PAM only."}
              </Muted>
            </Stack>
            {currentMode === "create" ? (
              <Field label="Name" error={errors.name}>
                <Input
                  autoFocus
                  placeholder="Machine 1"
                  autoComplete="off"
                  name="pam-identity-name"
                  value={name}
                  invalid={Boolean(errors.name)}
                  onChange={(event) => {
                    setName(event.target.value);
                    setErrors({});
                  }}
                />
              </Field>
            ) : (
              <Field label="Machine identity" error={errors.identity}>
                <Combobox
                  label="Machine identity"
                  placeholder="Select machine identity..."
                  emptyText="No machine identities available"
                  options={assignable.map((row) => ({
                    value: row.identity.id,
                    label: row.identity.name
                  }))}
                  value={identityId}
                  invalid={Boolean(errors.identity)}
                  onChange={(value) => {
                    setIdentityId(value);
                    setErrors({});
                  }}
                />
              </Field>
            )}
            <Field label="Product role">
              <ProductRoleField id="pam-add-identity-role" value={role} onChange={setRole} />
            </Field>
          </Stack>
        </form>
      </SheetBody>
      <SheetFooter>
        <Inline gap={8} justify="end">
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="add-pam-identity" loading={pending}>
            {currentMode === "assign" ? "Add" : "Create"}
          </Button>
        </Inline>
      </SheetFooter>
    </>
  );
};

const AddIdentitySheet = ({
  existing,
  open,
  onOpenChange
}: {
  existing: readonly TPamIdentityMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [pending, setPending] = useState(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>Add machine identity</SheetTitle>
        </SheetHeader>
        {open && (
          <AddIdentityForm
            existing={existing}
            pending={pending}
            setPending={setPending}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};

export const PamIdentitiesTab = () => {
  const go = useGo();
  const scope = useProjectScope();
  const { projectId } = scope;
  const queryClient = useQueryClient();
  const pam = useV4Adapter("pam");
  const access = useV4Adapter("access");
  const { permission } = useProjectPermission(projectId);
  const identities = pam.useProductIdentities();
  const updateIdentity = pam.useUpdateProductIdentityMember();
  const removeIdentity = pam.useRemoveProductIdentityMember();
  const deleteIdentity = access.useDeleteProjectManagedIdentity();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TPamIdentityMember>();
  const [removing, setRemoving] = useState<TPamIdentityMember>();

  const canCreate = permission.can(
    ProjectPermissionIdentityActions.Create,
    ProjectPermissionSub.Identity
  );
  const canEdit = permission.can(
    ProjectPermissionIdentityActions.Edit,
    ProjectPermissionSub.Identity
  );
  const canDelete = permission.can(
    ProjectPermissionIdentityActions.Delete,
    ProjectPermissionSub.Identity
  );

  const rows = useMemo(() => identities.data ?? [], [identities.data]);
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (member, needle) => member.name.toLowerCase().includes(needle),
    compare: (a, b, column) =>
      column === "added"
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  });

  const columns: DataTableColumn<TPamIdentityMember>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (member) => (
        <RowLink
          {...go.link(
            member.identityId ? accessLinks.projectIdentity(scope, member.identityId) : undefined
          )}
          title={member.name}
        >
          {member.name}
        </RowLink>
      )
    },
    {
      id: "role",
      header: "Product role",
      render: (member) => <Badge tone="soft">{builtInProjectRoleName(member.role)}</Badge>
    },
    {
      id: "managed",
      header: "Managed by",
      render: (member) =>
        isPamManaged(member, projectId) ? (
          <Badge tone="soft">
            <Icon name="folder" size={12} />
            PAM
          </Badge>
        ) : (
          <Badge tone="outline">
            <Icon name="building" size={12} />
            Organization
          </Badge>
        )
    },
    {
      id: "added",
      header: "Added on",
      sortable: true,
      render: (member) => <span>{formatDate(member.createdAt)}</span>
    }
  ];

  const rowActions: DataTableRowActions<TPamIdentityMember> = {
    renderMenu: (member) => (
      <>
        <DropdownMenuItem
          disabled={!canEdit}
          description={canEdit ? undefined : RESTRICTED}
          onSelect={() => setEditing(member)}
        >
          <Icon icon={PencilIcon} />
          Edit product role
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          description={canDelete ? undefined : RESTRICTED}
          onSelect={() => setRemoving(member)}
        >
          <Icon name="trash" />
          {isPamManaged(member, projectId) ? "Delete machine identity" : "Remove from PAM"}
        </DropdownMenuItem>
      </>
    )
  };

  const managedRemoval = removing ? isPamManaged(removing, projectId) : false;

  const remove = async () => {
    const member = removing;
    setRemoving(undefined);
    if (!member?.identityId) return;
    try {
      if (isPamManaged(member, projectId)) {
        await deleteIdentity.mutateAsync({ projectId, identityId: member.identityId });
        queryClient.invalidateQueries({ queryKey: pamKeys.productIdentities() });
        saved("Identity deleted");
      } else {
        await removeIdentity.mutateAsync({ projectId, identityId: member.identityId });
        saved("Identity removed");
      }
    } catch (error) {
      failed(managedRemoval ? "Failed to delete identity" : "Failed to remove identity", error);
    }
  };

  return (
    <Stack gap={16}>
      <FilterBar
        label="Machine identity filters"
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label="Search machine identities..."
            placeholder="Search machine identities..."
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
        }
        actions={
          <Gate allowed={canCreate} reason="You don't have permission to add machine identities">
            <Button
              variant="accent"
              icon="plus"
              disabled={!canCreate}
              onClick={() => setAdding(true)}
            >
              Add machine identity
            </Button>
          </Gate>
        }
      />
      <DataTable
        label="Machine identities"
        rows={list.pageRows}
        columns={columns}
        rowActions={rowActions}
        getRowId={(member) => member.membershipId}
        rowLabel={(member) => member.name}
        loading={identities.isPending}
        loadingRows={10}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          list.search.trim() ? (
            <EmptyState size="sm" icon="search" title="No machine identities match search" />
          ) : (
            <EmptyState size="sm" icon="machine" title="No machine identities found" />
          )
        }
        pagination={identities.isPending ? undefined : list.pagination}
      />
      <AddIdentitySheet existing={rows} open={adding} onOpenChange={setAdding} />
      <ProductRoleDialog
        key={editing?.membershipId}
        open={Boolean(editing)}
        onOpenChange={(next) => !next && setEditing(undefined)}
        name={editing?.name ?? ""}
        currentRole={editing?.role ?? ProjectMembershipRole.Member}
        onSave={(role) =>
          updateIdentity.mutateAsync({ projectId, identityId: editing?.identityId ?? "", role })
        }
        successMessage="Identity role updated"
        failureMessage="Failed to update identity role"
      />
      <ProductRemoveDialog
        open={Boolean(removing)}
        onOpenChange={(next) => !next && setRemoving(undefined)}
        title={
          managedRemoval
            ? `Delete ${removing?.name ?? "this machine identity"}?`
            : `Remove ${removing?.name ?? "this machine identity"} from PAM?`
        }
        description={
          managedRemoval
            ? "PAM manages this machine identity, so it is deleted permanently and cannot be recovered."
            : "It loses its PAM access but stays available in your organization."
        }
        confirmText={managedRemoval ? "delete" : "remove"}
        actionLabel={managedRemoval ? "Delete machine identity" : "Remove from PAM"}
        onConfirm={remove}
      />
    </Stack>
  );
};
