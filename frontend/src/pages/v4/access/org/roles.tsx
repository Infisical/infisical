import { useState } from "react";
import slugify from "@sindresorhus/slugify";
import { IdCardIcon, PencilIcon, ServerIcon, WrenchIcon } from "lucide-react";

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
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
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
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { isCustomOrgRole } from "@app/helpers/roles";
import type { TOrgRole } from "@app/hooks/api/roles/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { AccessRowLink, useGo } from "../navigation";
import { useOrgId, useOrgPermission } from "../permissions";
import { failed, saved } from "../toast";
import { Gate, ListToolbar, RESTRICTED, usePagedList } from "../ui";

import styles from "../access.module.css";

const DEFAULT_REASON =
  "Cannot delete default organization membership role. Re-assign default to allow deletion.";

const toSlug = (value: string) => slugify(value, { lowercase: true });

const RoleDialog = ({
  source,
  roles,
  open,
  onOpenChange
}: {
  source?: TOrgRole;
  roles: readonly TOrgRole[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const orgId = useOrgId();
  const go = useGo();
  const createRole = useV4Adapter("access").useCreateOrgRole();
  const initialName = source ? `${source.name} Duplicate` : "";
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(toSlug(initialName));
  const [slugDirty, setSlugDirty] = useState(false);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [pending, setPending] = useState(false);
  const formId = source ? "duplicate-org-role" : "create-org-role";
  const submit = async () => {
    let slugIssue: string | undefined;
    if (!slug) slugIssue = "Required";
    else if (!/^[a-z0-9-]+$/.test(slug))
      slugIssue = "Slug can only contain lowercase letters, numbers, and hyphens";
    else if (roles.some((role) => role.slug === slug))
      slugIssue = "A role with this slug already exists";
    const next = { name: name.trim() ? undefined : "Name required", slug: slugIssue };
    setErrors(next);
    if (next.name || next.slug) return;
    setPending(true);
    try {
      const role = await createRole.mutateAsync({
        orgId,
        name: name.trim(),
        slug,
        description,
        permissions: source?.permissions ?? []
      });
      saved(source ? "Role duplicated successfully" : "Successfully created role");
      onOpenChange(false);
      go(accessLinks.orgRole(orgId, role.id));
    } catch (error) {
      failed(source ? "Failed to duplicate role" : "Failed to create role", error);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{source ? "Duplicate role" : "Create role"}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field label="Name" error={errors.name}>
              <Input
                autoComplete="off"
                placeholder="Billing Team"
                value={name}
                invalid={Boolean(errors.name)}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!slugDirty) setSlug(toSlug(event.target.value));
                }}
              />
            </Field>
            <Field label="Slug" error={errors.slug}>
              <Input
                placeholder="billing"
                value={slug}
                invalid={Boolean(errors.slug)}
                onChange={(event) => {
                  setSlug(event.target.value);
                  setSlugDirty(true);
                }}
              />
            </Field>
            <Field label="Description" optional>
              <Input
                placeholder="To manage billing"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={pending}>
            {source ? "Duplicate role" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const OrgRolesTab = () => {
  const orgId = useOrgId();
  const go = useGo();
  const access = useV4Adapter("access");
  const { permission } = useOrgPermission();
  const { data: roles = [], isPending } = access.useOrgRoles(orgId);
  const { data: org } = access.useOrganization(orgId);
  const updateOrg = access.useUpdateOrganization();
  const deleteRole = access.useDeleteOrgRole();
  const [dialog, setDialog] = useState<{ source?: TOrgRole }>();
  const [deleting, setDeleting] = useState<TOrgRole>();
  const canCreate = permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.Role);
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Role);
  const canDelete = permission.can(OrgPermissionActions.Delete, OrgPermissionSubjects.Role);
  const canEditSettings = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
  const isDefault = (role: TOrgRole) =>
    org?.defaultMembershipRole === role.id || org?.defaultMembershipRole === role.slug;
  const list = usePagedList({
    rows: roles,
    initialSort: { columnId: "type", direction: "asc" },
    matches: (role, needle) =>
      role.name.toLowerCase().includes(needle) || role.slug.toLowerCase().includes(needle),
    compare: (a, b, column) => {
      if (column === "slug") return a.slug.localeCompare(b.slug);
      if (column === "type")
        return (isCustomOrgRole(a.slug) ? -1 : 1) - (isCustomOrgRole(b.slug) ? -1 : 1);
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    }
  });
  const openRole = (role: TOrgRole) => go(accessLinks.orgRole(orgId, role.id));

  const setDefault = async (role: TOrgRole) => {
    try {
      await updateOrg.mutateAsync({ orgId, defaultMembershipRoleSlug: role.slug });
      saved("Successfully updated default membership role");
    } catch (error) {
      failed("Failed to update default membership role", error);
    }
  };

  const remove = async (role: TOrgRole) => {
    try {
      await deleteRole.mutateAsync({ orgId, id: role.id });
      saved("Successfully removed the role");
    } catch (error) {
      failed("Failed to remove the role", error);
    }
  };

  const columns: DataTableColumn<TOrgRole>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      render: (role) => (
        <AccessRowLink href={accessLinks.orgRole(orgId, role.id)} title={role.name}>
          {role.name}
          {isDefault(role) && (
            <span className={styles.linkBadges}>
              <Tooltip
                content={`Members joining your organization will be assigned the ${role.name} role unless otherwise specified.`}
              >
                <Badge tone="info">Default</Badge>
              </Tooltip>
            </span>
          )}
        </AccessRowLink>
      )
    },
    {
      id: "slug",
      header: "Slug",
      sortable: true,
      grow: true,
      render: (role) => <span>{role.slug}</span>
    },
    {
      id: "type",
      header: "Type",
      sortable: true,
      render: (role) => {
        const custom = isCustomOrgRole(role.slug);
        return (
          <Badge tone="outline">
            <Icon icon={custom ? WrenchIcon : ServerIcon} size={12} />
            {custom ? "Custom" : "Platform"}
          </Badge>
        );
      }
    }
  ];

  const rowActions: DataTableRowActions<TOrgRole> = {
    inline: [
      {
        label: "Duplicate role",
        icon: "copy",
        disabledReason: () => (canCreate ? undefined : RESTRICTED),
        onSelect: (role) => setDialog({ source: role })
      }
    ],
    renderMenu: (role) => {
      const custom = isCustomOrgRole(role.slug);
      const roleIsDefault = isDefault(role);
      return (
        <>
          <DropdownMenuItem
            disabled={!canEdit}
            description={canEdit ? undefined : RESTRICTED}
            onSelect={() => openRole(role)}
          >
            {custom ? <Icon icon={PencilIcon} /> : <Icon name="eye" />}
            {custom ? "Edit role" : "View role"}
          </DropdownMenuItem>
          {!roleIsDefault && (
            <DropdownMenuItem
              disabled={!canEditSettings}
              description={canEditSettings ? undefined : RESTRICTED}
              onSelect={() => setDefault(role)}
            >
              <Icon icon={IdCardIcon} />
              Set as default role
            </DropdownMenuItem>
          )}
          {custom && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={!canDelete || roleIsDefault}
                description={
                  (!canDelete && RESTRICTED) || (roleIsDefault ? DEFAULT_REASON : undefined)
                }
                onSelect={() => setDeleting(role)}
              >
                <Icon name="trash" />
                Delete role
              </DropdownMenuItem>
            </>
          )}
        </>
      );
    }
  };

  return (
    <Stack gap={16}>
      <div className={styles.toolbar}>
        <div className={styles.grow}>
          <ListToolbar
            search={list.search}
            onSearch={list.setSearch}
            placeholder="Search organization roles..."
          />
        </div>
        <Gate allowed={canCreate}>
          <Button variant="accent" icon="plus" disabled={!canCreate} onClick={() => setDialog({})}>
            Create
          </Button>
        </Gate>
      </div>
      <DataTable
        label="Organization roles"
        rows={list.pageRows}
        columns={columns}
        rowActions={rowActions}
        getRowId={(role) => role.id}
        rowLabel={(role) => role.name}
        loading={isPending}
        loadingRows={10}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={
          roles.length ? (
            <EmptyState size="sm" icon="search" title="No organization roles match search" />
          ) : (
            <EmptyState size="sm" icon="key" title="This organization does not have any roles" />
          )
        }
        pagination={isPending ? undefined : list.pagination}
      />
      {dialog && (
        <RoleDialog
          key={dialog.source?.id ?? "new"}
          source={dialog.source}
          roles={roles}
          open
          onOpenChange={(open) => !open && setDialog(undefined)}
        />
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={deleting?.slug ?? ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to delete ${deleting?.name ?? ""} role?`}
            </AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) remove(deleting);
                setDeleting(undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
