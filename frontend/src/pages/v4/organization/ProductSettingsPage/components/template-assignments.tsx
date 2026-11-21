import { type ReactNode, useId, useMemo, useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiSelect, type MultiSelectOption } from "@infisical/cipher/ui/multi-select";
import { SettingsCard, useAutosave } from "@infisical/cipher/ui/settings-card";
import { ToggleGroup, ToggleGroupItem } from "@infisical/cipher/ui/toggle-group";

import type {
  TProjectTemplate,
  TProjectTemplateGroup,
  TProjectTemplateIdentity,
  TProjectTemplateProjectManagedIdentity,
  TProjectTemplateUser
} from "@app/hooks/api/projectTemplates";
import { useDebounce } from "@app/hooks/useDebounce";

import { useOrgId } from "../../../access/permissions";
import { failed } from "../../../access/toast";
import { RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";

const PREDEFINED_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
  { value: "no-access", label: "No Access" }
];
const RESERVED = new Set([...PREDEFINED_ROLES.map((role) => role.value), "custom"]);

export const useTemplateRoleOptions = (template: TProjectTemplate) =>
  useMemo<MultiSelectOption[]>(
    () => [
      ...PREDEFINED_ROLES,
      ...template.roles
        .filter((role) => !RESERVED.has(role.slug))
        .map((role) => ({ value: role.slug, label: role.name }))
    ],
    [template.roles]
  );

const withOrphans = (options: readonly MultiSelectOption[], roles: readonly string[]) => {
  const known = new Set(options.map((option) => option.value));
  return [
    ...options,
    ...roles.filter((slug) => !known.has(slug)).map((slug) => ({ value: slug, label: slug }))
  ];
};

type Row = { key: string; name: string; secondary?: string; roles: string[]; managedBy?: string };

const AssignmentsCard = ({
  title,
  noun,
  rows,
  roleOptions,
  canEdit,
  pending,
  status,
  addLabel,
  addDisabledReason,
  onAdd,
  onRolesChange,
  onRemove
}: {
  title: string;
  noun: string;
  rows: Row[];
  roleOptions: MultiSelectOption[];
  canEdit: boolean;
  pending: boolean;
  status: ReturnType<typeof useAutosave>["status"];
  addLabel: string;
  addDisabledReason?: string;
  onAdd: () => void;
  onRolesChange: (key: string, roles: string[]) => void;
  onRemove: (key: string) => void;
}) => {
  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      header: noun,
      primary: true,
      grow: true,
      minWidth: 200,
      text: (row) => row.name,
      render: (row) => row.name,
      secondary: (row) => row.secondary
    },
    ...(rows.some((row) => row.managedBy)
      ? [
          {
            id: "managed",
            header: "Managed by",
            width: 140,
            render: (row: Row) => <Badge tone="soft">{row.managedBy}</Badge>
          }
        ]
      : []),
    {
      id: "roles",
      header: "Roles",
      width: 320,
      render: (row) => (
        <MultiSelect
          label={`Roles for ${row.name}`}
          size="sm"
          placeholder="Select roles..."
          disabled={!canEdit || pending}
          options={withOrphans(roleOptions, row.roles)}
          value={row.roles}
          onChange={(roles) => {
            if (!roles.length) {
              failed(`Each ${noun.toLowerCase()} needs at least one role`);
              return;
            }
            onRolesChange(row.key, roles);
          }}
        />
      )
    }
  ];
  return (
    <SettingsCard
      flush
      title={title}
      saveStatus={status}
      action={
        <Button
          variant="outline"
          icon="plus"
          disabledReason={canEdit ? addDisabledReason : RESTRICTED}
          onClick={onAdd}
        >
          {addLabel}
        </Button>
      }
    >
      {rows.length ? (
        <DataTable
          label={title}
          rows={rows}
          columns={columns}
          getRowId={(row) => row.key}
          rowLabel={(row) => row.name}
          rowActions={{
            menuDisabledReason: () => (canEdit ? undefined : RESTRICTED),
            renderMenu: (row) => (
              <DropdownMenuItem
                variant="destructive"
                disabled={pending}
                onSelect={() => onRemove(row.key)}
              >
                <Icon name="trash" />
                {`Remove ${noun.toLowerCase()}`}
              </DropdownMenuItem>
            )
          }}
        />
      ) : (
        <EmptyState size="sm" icon="users" title={`No ${title.toLowerCase()} in this template`} />
      )}
    </SettingsCard>
  );
};

const AddDialog = ({
  title,
  submitLabel,
  children,
  valid,
  onSubmit,
  onOpenChange
}: {
  title: string;
  submitLabel: string;
  children: ReactNode;
  valid: boolean;
  onSubmit: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) => {
  const formId = useId();
  const [pending, setPending] = useState(false);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (!valid) return;
            setPending(true);
            try {
              await onSubmit();
            } finally {
              setPending(false);
            }
            onOpenChange(false);
          }}
        >
          <Stack gap={16}>{children}</Stack>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={formId} variant="primary" loading={pending} disabled={!valid}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RolesField = ({
  options,
  value,
  onChange
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (roles: string[]) => void;
}) => (
  <Field label="Roles">
    <MultiSelect
      label="Roles"
      placeholder="Select roles..."
      options={options}
      value={value}
      onChange={onChange}
    />
  </Field>
);

type CardProps = { template: TProjectTemplate; canEdit: boolean };

export const TemplateUsersCard = ({ template, canEdit }: CardProps) => {
  const orgId = useOrgId();
  const update = useV4Adapter("productSettings").useUpdateProjectTemplate();
  const { data: orgUsers = [] } = useV4Adapter("productSettings").useOrgUsers(orgId);
  const roleOptions = useTemplateRoleOptions(template);
  const stored = useMemo(() => template.users ?? [], [template.users]);
  const { value, save, status, pending } = useAutosave<TProjectTemplateUser[]>({
    value: stored,
    errorMessage: "Couldn't update template users. Try again.",
    onSave: async (users) => {
      await update.mutateAsync({ templateId: template.id, users: users.length ? users : null });
    }
  });
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const added = new Set(value.map((user) => user.username.toLowerCase()));
  const available = orgUsers
    .filter(({ user }) => user.username && !added.has(user.username.toLowerCase()))
    .map(({ user }) => ({
      value: user.username,
      label:
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.email || user.username,
      description: user.username
    }));
  const byUsername = new Map(orgUsers.map(({ user }) => [user.username, user]));
  return (
    <>
      <AssignmentsCard
        title="Users"
        noun="User"
        rows={value.map((user) => {
          const known = byUsername.get(user.username);
          const fullName =
            known?.firstName && known.lastName ? `${known.firstName} ${known.lastName}` : undefined;
          return {
            key: user.username,
            name: fullName ?? user.username,
            secondary: fullName ? user.username : undefined,
            roles: user.roles
          };
        })}
        roleOptions={roleOptions}
        canEdit={canEdit}
        pending={pending}
        status={status}
        addLabel="Add users"
        addDisabledReason={
          available.length ? undefined : "Every organization member is already added"
        }
        onAdd={() => {
          setSelected([]);
          setRoles([]);
          setAdding(true);
        }}
        onRolesChange={(key, next) =>
          save(value.map((user) => (user.username === key ? { ...user, roles: next } : user)))
        }
        onRemove={(key) => save(value.filter((user) => user.username !== key))}
      />
      {adding && (
        <AddDialog
          title="Add users to template"
          submitLabel="Add users"
          valid={selected.length > 0 && roles.length > 0}
          onOpenChange={setAdding}
          onSubmit={() => save([...value, ...selected.map((username) => ({ username, roles }))])}
        >
          <Field label="Users">
            <MultiSelect
              label="Users"
              placeholder="Select one or more users..."
              options={available}
              value={selected}
              onChange={setSelected}
            />
          </Field>
          <RolesField options={roleOptions} value={roles} onChange={setRoles} />
        </AddDialog>
      )}
    </>
  );
};

export const TemplateGroupsCard = ({ template, canEdit }: CardProps) => {
  const orgId = useOrgId();
  const update = useV4Adapter("productSettings").useUpdateProjectTemplate();
  const { data: orgGroups = [] } = useV4Adapter("productSettings").useOrgGroups(orgId);
  const roleOptions = useTemplateRoleOptions(template);
  const stored = useMemo(() => template.groups ?? [], [template.groups]);
  const { value, save, status, pending } = useAutosave<TProjectTemplateGroup[]>({
    value: stored,
    errorMessage: "Couldn't update template groups. Try again.",
    onSave: async (groups) => {
      await update.mutateAsync({ templateId: template.id, groups: groups.length ? groups : null });
    }
  });
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const added = new Set(value.map((group) => group.groupSlug));
  const available = orgGroups
    .filter((group) => !added.has(group.slug))
    .map((group) => ({ value: group.slug, label: group.name, description: group.slug }));
  const bySlug = new Map(orgGroups.map((group) => [group.slug, group.name]));
  return (
    <>
      <AssignmentsCard
        title="Groups"
        noun="Group"
        rows={value.map((group) => ({
          key: group.groupSlug,
          name: bySlug.get(group.groupSlug) ?? group.groupSlug,
          secondary: bySlug.has(group.groupSlug) ? group.groupSlug : undefined,
          roles: group.roles
        }))}
        roleOptions={roleOptions}
        canEdit={canEdit}
        pending={pending}
        status={status}
        addLabel="Add groups"
        addDisabledReason={
          available.length ? undefined : "Every organization group is already added"
        }
        onAdd={() => {
          setSelected([]);
          setRoles([]);
          setAdding(true);
        }}
        onRolesChange={(key, next) =>
          save(value.map((group) => (group.groupSlug === key ? { ...group, roles: next } : group)))
        }
        onRemove={(key) => save(value.filter((group) => group.groupSlug !== key))}
      />
      {adding && (
        <AddDialog
          title="Add groups to template"
          submitLabel="Add groups"
          valid={selected.length > 0 && roles.length > 0}
          onOpenChange={setAdding}
          onSubmit={() => save([...value, ...selected.map((groupSlug) => ({ groupSlug, roles }))])}
        >
          <Field label="Groups">
            <MultiSelect
              label="Groups"
              placeholder="Select one or more groups..."
              options={available}
              value={selected}
              onChange={setSelected}
            />
          </Field>
          <RolesField options={roleOptions} value={roles} onChange={setRoles} />
        </AddDialog>
      )}
    </>
  );
};

type Identities = {
  identities: TProjectTemplateIdentity[];
  projectManagedIdentities: TProjectTemplateProjectManagedIdentity[];
};

const AddIdentityDialog = ({
  roleOptions,
  takenIds,
  onAdd,
  onOpenChange
}: {
  roleOptions: MultiSelectOption[];
  takenIds: Set<string>;
  onAdd: (
    entry: { kind: "project"; name: string } | { kind: "org"; id: string; name: string },
    roles: string[]
  ) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) => {
  const orgId = useOrgId();
  const [kind, setKind] = useState<"project" | "org">("project");
  const [name, setName] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [query, setQuery] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [debounced] = useDebounce(query, 300);
  const { data, isPending } = useV4Adapter("productSettings").useSearchOrgIdentities({
    orgId,
    limit: 100,
    search: debounced ? { name: { $contains: debounced } } : {}
  });
  const options = (data?.identities ?? [])
    .filter(({ identity }) => !takenIds.has(identity.id))
    .map(({ identity }) => ({ value: identity.id, label: identity.name }));
  const picked = options.find((option) => option.value === identityId);
  const valid = roles.length > 0 && (kind === "project" ? Boolean(name.trim()) : Boolean(picked));
  return (
    <AddDialog
      title="Add machine identity to template"
      submitLabel="Add machine identity"
      valid={valid}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        onAdd(
          kind === "project"
            ? { kind, name: name.trim() }
            : { kind, id: identityId, name: picked?.label ?? "" },
          roles
        )
      }
    >
      <Field
        label="Source"
        description={
          kind === "project"
            ? "Each project created from this template gets its own new identity, managed in the project."
            : "Adds an existing organization identity to each project, keeping control central."
        }
      >
        <ToggleGroup
          type="single"
          width="full"
          value={kind}
          onValueChange={(next) => next && setKind(next as "project" | "org")}
        >
          <ToggleGroupItem value="project">Create new</ToggleGroupItem>
          <ToggleGroupItem value="org">Assign existing</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {kind === "project" ? (
        <Field label="Name">
          <Input
            placeholder="service-runtime"
            data-1p-ignore
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      ) : (
        <Field label="Machine identity">
          <Combobox
            label="Machine identity"
            placeholder="Select a machine identity..."
            emptyText="No machine identities found."
            loading={isPending}
            options={options}
            value={identityId}
            onSearch={setQuery}
            onChange={setIdentityId}
          />
        </Field>
      )}
      <RolesField options={roleOptions} value={roles} onChange={setRoles} />
    </AddDialog>
  );
};

export const TemplateIdentitiesCard = ({ template, canEdit }: CardProps) => {
  const update = useV4Adapter("productSettings").useUpdateProjectTemplate();
  const roleOptions = useTemplateRoleOptions(template);
  const stored = useMemo<Identities>(
    () => ({
      identities: template.identities ?? [],
      projectManagedIdentities: template.projectManagedIdentities ?? []
    }),
    [template.identities, template.projectManagedIdentities]
  );
  const { value, save, status, pending } = useAutosave<Identities>({
    value: stored,
    errorMessage: "Couldn't update template machine identities. Try again.",
    onSave: async (next) => {
      await update.mutateAsync({
        templateId: template.id,
        identities: next.identities.length ? next.identities : null,
        projectManagedIdentities: next.projectManagedIdentities.length
          ? next.projectManagedIdentities
          : null
      });
    }
  });
  const [adding, setAdding] = useState(false);
  const rows: Row[] = [
    ...value.projectManagedIdentities.map((identity, index) => ({
      key: `project:${index}`,
      name: identity.name,
      roles: identity.roles,
      managedBy: "Project"
    })),
    ...value.identities.map((identity) => ({
      key: `org:${identity.identityId}`,
      name: identity.identityName,
      roles: identity.roles,
      managedBy: "Organization"
    }))
  ];
  const patch = (key: string, change: (roles: string[]) => string[] | null): Identities => {
    const [kind, id] = key.split(/:(.*)/s);
    if (kind === "project")
      return {
        ...value,
        projectManagedIdentities: value.projectManagedIdentities.flatMap((identity, index) => {
          if (String(index) !== id) return [identity];
          const next = change(identity.roles);
          return next ? [{ ...identity, roles: next }] : [];
        })
      };
    return {
      ...value,
      identities: value.identities.flatMap((identity) => {
        if (identity.identityId !== id) return [identity];
        const next = change(identity.roles);
        return next ? [{ ...identity, roles: next }] : [];
      })
    };
  };
  return (
    <>
      <AssignmentsCard
        title="Machine identities"
        noun="Identity"
        rows={rows}
        roleOptions={roleOptions}
        canEdit={canEdit}
        pending={pending}
        status={status}
        addLabel="Add machine identity"
        onAdd={() => setAdding(true)}
        onRolesChange={(key, roles) => save(patch(key, () => roles))}
        onRemove={(key) => save(patch(key, () => null))}
      />
      {adding && (
        <AddIdentityDialog
          roleOptions={roleOptions}
          takenIds={new Set(value.identities.map((identity) => identity.identityId))}
          onOpenChange={setAdding}
          onAdd={(entry, roles) =>
            save(
              entry.kind === "project"
                ? {
                    ...value,
                    projectManagedIdentities: [
                      ...value.projectManagedIdentities,
                      { name: entry.name, roles }
                    ]
                  }
                : {
                    ...value,
                    identities: [
                      ...value.identities,
                      { identityId: entry.id, identityName: entry.name, roles }
                    ]
                  }
            )
          }
        />
      )}
    </>
  );
};
