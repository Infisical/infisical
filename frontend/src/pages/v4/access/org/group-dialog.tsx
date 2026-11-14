import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
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
import { Select } from "@infisical/cipher/ui/select";

import { findOrgMembershipRole } from "@app/helpers/roles";

import { useV4Adapter } from "../../data/adapters";
import { useOrgId } from "../permissions";
import { roleOptions, slugify } from "../roles";
import { failed, saved } from "../toast";

export type GroupDraft = { id: string; name: string; slug: string; roleSlug: string };

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

export const GroupDialog = ({
  group,
  open,
  roleLabel,
  onOpenChange
}: {
  group?: GroupDraft;
  open: boolean;
  roleLabel?: string;
  onOpenChange: (open: boolean) => void;
}) => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const { data: roles = [] } = access.useOrgRoles(orgId);
  const { data: organization } = access.useOrganization(orgId);
  const create = access.useCreateGroup();
  const update = access.useUpdateGroup();
  const isCreate = !group;
  const defaultRole =
    (organization && findOrgMembershipRole(roles, organization.defaultMembershipRole)?.slug) ??
    "member";
  const [name, setName] = useState(group?.name ?? "");
  const [slug, setSlug] = useState(group?.slug ?? "");
  const [slugDirty, setSlugDirty] = useState(false);
  const [role, setRole] = useState<string | undefined>(group?.roleSlug);
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [pending, setPending] = useState(false);
  const label = roleLabel ?? (isCreate ? "Role" : "Update role");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{isCreate ? "Create group" : "Update group"}</DialogTitle>
        </DialogHeader>
        <form
          id="org-group"
          onSubmit={async (event) => {
            event.preventDefault();
            const next = { name: nameError(name), slug: slugError(slug) };
            setErrors(next);
            if (next.name || next.slug) return;
            setPending(true);
            try {
              if (group)
                await update.mutateAsync({
                  id: group.id,
                  name: name.trim(),
                  slug,
                  role: role ?? defaultRole,
                  organizationId: orgId
                });
              else
                await create.mutateAsync({
                  name: name.trim(),
                  slug,
                  role: role ?? defaultRole,
                  organizationId: orgId
                });
              saved(`Successfully ${isCreate ? "created" : "updated"} group`);
              onOpenChange(false);
            } catch (error) {
              failed(`Failed to ${isCreate ? "create" : "update"} group`, error);
            } finally {
              setPending(false);
            }
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
            <Field label={label}>
              <Select
                label={label}
                placeholder="Select role..."
                value={role ?? defaultRole}
                options={roleOptions(roles)}
                onChange={setRole}
              />
            </Field>
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="org-group" loading={pending}>
            {isCreate ? "Create" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
