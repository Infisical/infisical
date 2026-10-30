import { useState } from "react";
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
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack, Inline } from "@app/components/v4/ui/layout";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { useAccess } from "../context";
import type { Role } from "../model";
import { Gate, ListToolbar, useCan, usePagedList } from "../ui";
import { slugify } from "./group-dialog";

import styles from "../access.module.css";

const DEFAULT_REASON =
  "Cannot delete default organization membership role. Re-assign default to allow deletion.";

const RoleDialog = ({
  source,
  open,
  onOpenChange
}: {
  source?: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data, update, saved, navigate } = useAccess();
  const initialName = source ? `${source.name} Duplicate` : "";
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(slugify(initialName));
  const [slugDirty, setSlugDirty] = useState(false);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [pending, setPending] = useState(false);
  const formId = source ? "duplicate-org-role" : "create-org-role";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{source ? "Duplicate role" : "Create role"}</DialogTitle>
          {source && (
            <DialogDescription>
              Duplicate this role to create a new role with the same permissions.
            </DialogDescription>
          )}
        </DialogHeader>
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            let slugIssue: string | undefined;
            if (!slug) slugIssue = "Required";
            else if (!/^[a-z0-9-]+$/.test(slug))
              slugIssue = "Slug can only contain lowercase letters, numbers, and hyphens";
            else if (data.orgRoles.some((role) => role.slug === slug))
              slugIssue = "A role with this slug already exists";
            const next = { name: name.trim() ? undefined : "Name required", slug: slugIssue };
            setErrors(next);
            if (next.name || next.slug) return;
            setPending(true);
            window.setTimeout(() => {
              const role: Role = {
                ...source,
                id: `r-${crypto.randomUUID()}`,
                name: name.trim(),
                slug,
                description,
                builtIn: false
              };
              update((current) => ({ ...current, orgRoles: [...current.orgRoles, role] }));
              setPending(false);
              saved(source ? "Role duplicated successfully" : "Successfully created role");
              onOpenChange(false);
              navigate({ detail: { kind: "org-role", id: role.id, label: role.name } });
            }, 400);
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
                  if (!slugDirty) setSlug(slugify(event.target.value));
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
  const { data, update, saved, loading, navigate, startsWith } = useAccess();
  const can = useCan("org");
  const [dialog, setDialog] = useState<{ source?: Role } | undefined>(() =>
    startsWith("create") ? {} : undefined
  );
  const [deleting, setDeleting] = useState<Role>();
  const list = usePagedList({
    rows: data.orgRoles,
    initialSort: { columnId: "type", direction: "asc" },
    matches: (role, needle) =>
      role.name.toLowerCase().includes(needle) || role.slug.toLowerCase().includes(needle),
    compare: (a, b, column) => {
      if (column === "slug") return a.slug.localeCompare(b.slug);
      if (column === "type") return (b.builtIn ? 1 : -1) - (a.builtIn ? 1 : -1);
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    }
  });
  const openRole = (role: Role) =>
    navigate({ detail: { kind: "org-role", id: role.id, label: role.name } });

  const columns: DataTableColumn<Role>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (role) => (
        <Inline gap={8} wrap={false}>
          <span>{role.name}</span>
          {role.slug === data.defaultOrgRole && (
            <Tooltip
              content={`Members joining your organization will be assigned the ${role.name} role unless otherwise specified.`}
            >
              <Badge tone="info">Default</Badge>
            </Tooltip>
          )}
        </Inline>
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
      render: (role) => (
        <Badge tone="outline">
          <Icon icon={role.builtIn ? ServerIcon : WrenchIcon} size={12} />
          {role.builtIn ? "Platform" : "Custom"}
        </Badge>
      )
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (role) => {
        const isDefault = role.slug === data.defaultOrgRole;
        return (
          <DropdownMenu defaultOpen={startsWith("row-menu") && role.slug === "release-manager"}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-row" icon="more" iconOnly>
                {`Actions for ${role.name}`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!can("role", "edit")} onSelect={() => openRole(role)}>
                {role.builtIn ? <Icon name="eye" /> : <Icon icon={PencilIcon} />}
                {role.builtIn ? "View role" : "Edit role"}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!can("role", "create")}
                onSelect={() => setDialog({ source: role })}
              >
                <Icon name="copy" />
                Duplicate role
              </DropdownMenuItem>
              {!isDefault && (
                <DropdownMenuItem
                  disabled={!can("role", "edit")}
                  onSelect={() => {
                    update((current) => ({ ...current, defaultOrgRole: role.slug }));
                    saved("Successfully updated default membership role");
                  }}
                >
                  <Icon icon={IdCardIcon} />
                  Set as default role
                </DropdownMenuItem>
              )}
              {!role.builtIn && (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!can("role", "delete") || isDefault}
                  description={isDefault ? DEFAULT_REASON : undefined}
                  onSelect={() => setDeleting(role)}
                >
                  <Icon name="trash" />
                  Delete role
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }
    }
  ];

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
        <Gate allowed={can("role", "create")}>
          <Button
            variant="primary"
            icon="plus"
            disabled={!can("role", "create")}
            onClick={() => setDialog({})}
          >
            Create
          </Button>
        </Gate>
      </div>
      <Stack gap={8}>
        <DataTable
          label="Organization roles"
          rows={list.pageRows}
          columns={columns}
          getRowId={(role) => role.id}
          rowLabel={(role) => role.name}
          loading={loading}
          loadingRows={10}
          sort={list.sort}
          onSortChange={list.setSort}
          onRowActivate={openRole}
          empty={
            data.orgRoles.length ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No organization roles match search"
                description="Adjust your search criteria."
              />
            ) : (
              <EmptyState
                size="sm"
                icon="key"
                title="This organization does not have any roles"
                description="Add a role to get started."
              />
            )
          }
        />
        {!loading && list.pagination}
      </Stack>
      {dialog && (
        <RoleDialog
          key={dialog.source?.id ?? "new"}
          source={dialog.source}
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
                update((current) => ({
                  ...current,
                  orgRoles: current.orgRoles.filter((role) => role.id !== deleting?.id)
                }));
                setDeleting(undefined);
                saved("Successfully removed the role");
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
