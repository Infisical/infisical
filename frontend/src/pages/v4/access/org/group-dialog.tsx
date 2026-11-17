import { type ReactNode, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { Tabs } from "@infisical/cipher/ui/tabs";

import { findOrgMembershipRole } from "@app/helpers/roles";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgId } from "../permissions";
import { roleOptions, slugify } from "../roles";
import { failed, readableFailure, saved } from "../toast";
import { Muted } from "../ui";

export type GroupDraft = { id: string; name: string; slug: string; roleSlug: string };

type GroupDialogProps = {
  group?: GroupDraft;
  open: boolean;
  roleLabel?: string;
  onOpenChange: (open: boolean) => void;
};

type FormProps = {
  onDone: () => void;
  setPending: (pending: boolean) => void;
};

const FORM_ID = "org-group";

const nameError = (name: string) => {
  if (!name.trim()) return "Name cannot be empty";
  if (name.length > 255) return "Name must be 255 characters or fewer";
  return undefined;
};

const slugError = (slug: string) => {
  if (slug.length < 5) return "Slug must be at least 5 characters long";
  if (slug.length > 255) return "Slug must be 255 characters or fewer";
  if (!/^[a-z0-9-]+$/.test(slug))
    return "Slug can only contain lowercase letters, numbers, and hyphens";
  return undefined;
};

const useGroupRoles = () => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const { data: roles = [] } = access.useOrgRoles(orgId);
  const { data: organization } = access.useOrganization(orgId);
  const defaultRole =
    (organization && findOrgMembershipRole(roles, organization.defaultMembershipRole)?.slug) ??
    "member";
  return { orgId, roles, defaultRole };
};

const RoleField = ({
  label,
  value,
  onChange
}: {
  label: string;
  value: string | undefined;
  onChange: (role: string) => void;
}) => {
  const { roles, defaultRole } = useGroupRoles();
  return (
    <Field label={label}>
      <Select
        label={label}
        placeholder="Select role..."
        value={value ?? defaultRole}
        options={roleOptions(roles)}
        onChange={onChange}
      />
    </Field>
  );
};

const GroupForm = ({
  group,
  roleLabel,
  onDone,
  setPending
}: FormProps & { group?: GroupDraft; roleLabel: string }) => {
  const access = useV4Adapter("access");
  const { orgId, defaultRole } = useGroupRoles();
  const create = access.useCreateGroup();
  const update = access.useUpdateGroup();
  const isCreate = !group;
  const [name, setName] = useState(group?.name ?? "");
  const [slug, setSlug] = useState(group?.slug ?? "");
  const [slugDirty, setSlugDirty] = useState(false);
  const [role, setRole] = useState<string | undefined>(group?.roleSlug);
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const submit = async () => {
    const next = { name: nameError(name), slug: slugError(slug) };
    setErrors(next);
    if (next.name || next.slug) return;
    const values = { name: name.trim(), slug, role: role ?? defaultRole, organizationId: orgId };
    setPending(true);
    try {
      if (group) await update.mutateAsync({ id: group.id, ...values });
      else await create.mutateAsync(values);
      saved(`Successfully ${isCreate ? "created" : "updated"} group`);
      onDone();
    } catch (error) {
      failed(`Failed to ${isCreate ? "create" : "update"} group`, error);
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      id={FORM_ID}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Stack gap={16}>
        <Field label="Name" error={errors.name}>
          <Input
            autoComplete="off"
            placeholder="Engineering"
            value={name}
            invalid={Boolean(errors.name)}
            onChange={(event) => {
              setName(event.target.value);
              if (isCreate && !slugDirty) setSlug(slugify(event.target.value));
            }}
          />
        </Field>
        <Field label="Slug" error={errors.slug}>
          <Input
            placeholder="engineering"
            value={slug}
            invalid={Boolean(errors.slug)}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugDirty(true);
            }}
          />
        </Field>
        <RoleField label={roleLabel} value={role} onChange={setRole} />
      </Stack>
    </form>
  );
};

const GroupDialogShell = ({
  open,
  onOpenChange,
  title,
  submitLabel,
  pending,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  pending: boolean;
  children: ReactNode;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent pending={pending}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      {children}
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form={FORM_ID} loading={pending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const OwnedGroupDialog = ({ group, open, roleLabel, onOpenChange }: GroupDialogProps) => {
  const [pending, setPending] = useState(false);
  const isCreate = !group;
  return (
    <GroupDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={isCreate ? "Create group" : "Update group"}
      submitLabel={isCreate ? "Create" : "Update"}
      pending={pending}
    >
      <GroupForm
        group={group}
        roleLabel={roleLabel ?? (isCreate ? "Role" : "Update role")}
        onDone={() => onOpenChange(false)}
        setPending={setPending}
      />
    </GroupDialogShell>
  );
};

type SubOrgGroupDraft = {
  mode: "create" | "assign";
  name: string;
  slug: string;
  slugDirty: boolean;
  groupId: string;
  role?: string;
};

const EMPTY_SUB_ORG_GROUP: SubOrgGroupDraft = {
  mode: "create",
  name: "",
  slug: "",
  slugDirty: false,
  groupId: ""
};

const validateSubOrgGroup = (draft: SubOrgGroupDraft) => {
  if (draft.mode === "assign")
    return draft.groupId ? true : { fields: { group: "Select a group" } };
  const fields = { name: nameError(draft.name), slug: slugError(draft.slug) };
  return fields.name || fields.slug ? { fields } : true;
};

const SubOrgAddGroupDialog = ({ open, roleLabel, onOpenChange }: GroupDialogProps) => {
  const access = useV4Adapter("access");
  const go = useGo();
  const { orgId, defaultRole } = useGroupRoles();
  const create = access.useCreateGroup();
  const link = access.useCreateOrgGroupMembership();
  const [draft, setDraft] = useState(EMPTY_SUB_ORG_GROUP);
  const [completed, setCompleted] = useState(false);
  const { data: available = [], isPending: availablePending } = access.useAvailableOrgGroups({
    enabled: draft.mode === "assign"
  });
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty:
      !completed && Boolean(draft.name || draft.slug || draft.groupId || draft.role !== undefined),
    onDiscard: () => onOpenChange(false)
  });
  const update = (patch: Partial<SubOrgGroupDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const role = draft.role ?? defaultRole;
  const finish = () => {
    setCompleted(true);
    onOpenChange(false);
  };
  return (
    <>
      <MultiStep
        variant="dialog"
        open={open}
        title="Add group to sub-organization"
        completeLabel={draft.mode === "assign" ? "Link" : "Create"}
        onOpenChange={(next) => !next && requestDiscard()}
        onComplete={async () => {
          if (draft.mode === "assign") {
            await link
              .mutateAsync({
                groupId: draft.groupId,
                roles: [{ role, isTemporary: false }],
                organizationId: orgId
              })
              .catch(readableFailure("Couldn't link group"));
            saved("Successfully linked group");
            finish();
            go(accessLinks.orgGroup(orgId, draft.groupId));
            return;
          }
          await create
            .mutateAsync({ name: draft.name.trim(), slug: draft.slug, role, organizationId: orgId })
            .catch(readableFailure("Couldn't create group"));
          saved("Successfully created group");
          finish();
        }}
        steps={[
          {
            title: "Group",
            validate: () => validateSubOrgGroup(draft),
            content: (
              <Stack gap={16}>
                <Stack gap={8}>
                  <Tabs
                    variant="segmented"
                    label="Group assignment mode"
                    value={draft.mode}
                    onChange={(next) => update({ mode: next as SubOrgGroupDraft["mode"] })}
                    tabs={[
                      { value: "create", label: "Create new" },
                      { value: "assign", label: "Assign existing" }
                    ]}
                  />
                  <Muted>
                    {draft.mode === "assign"
                      ? "Reuse an existing group from your parent organization."
                      : "Creates a group managed by this sub-organization."}
                  </Muted>
                </Stack>
                {draft.mode === "assign" ? (
                  <Field label="Group" name="group">
                    <Combobox
                      label="Group"
                      placeholder="Select group..."
                      emptyText={
                        availablePending
                          ? "Loading groups..."
                          : "Every parent organization group is already here"
                      }
                      options={available.map((entry) => ({ value: entry.id, label: entry.name }))}
                      value={draft.groupId}
                      onChange={(groupId) => update({ groupId })}
                    />
                  </Field>
                ) : (
                  <>
                    <Field label="Name" name="name">
                      <Input
                        autoComplete="off"
                        placeholder="Engineering"
                        value={draft.name}
                        onChange={(event) =>
                          update({
                            name: event.target.value,
                            ...(draft.slugDirty ? {} : { slug: slugify(event.target.value) })
                          })
                        }
                      />
                    </Field>
                    <Field label="Slug" name="slug">
                      <Input
                        placeholder="engineering"
                        value={draft.slug}
                        onChange={(event) => update({ slug: event.target.value, slugDirty: true })}
                      />
                    </Field>
                  </>
                )}
                <RoleField
                  label={roleLabel ?? "Role"}
                  value={draft.role}
                  onChange={(next) => update({ role: next })}
                />
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog {...discardDialogProps} title="Discard this group?" />
    </>
  );
};

export const GroupDialog = (props: GroupDialogProps) => {
  const isSubOrg = useV4Session().organization.isSubOrganization;
  return isSubOrg && !props.group ? (
    <SubOrgAddGroupDialog {...props} />
  ) : (
    <OwnedGroupDialog {...props} />
  );
};
