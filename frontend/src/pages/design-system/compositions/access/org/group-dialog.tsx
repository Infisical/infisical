import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";

import { useAccess } from "../context";
import type { AccessData, OrgGroup } from "../model";
import { roleOptions } from "./create-identity-sheet";
import { ADDED_TODAY } from "./memberships";

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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

export const setGroupRole = (data: AccessData, groupId: string, role: string): AccessData => ({
  ...data,
  orgGroups: data.orgGroups.map((group) => (group.id === groupId ? { ...group, role } : group)),
  orgMembers: data.orgMembers.map((member) => ({
    ...member,
    groups: member.groups.map((group) =>
      group.id === groupId ? { ...group, roles: [{ role }] } : group
    )
  }))
});

export const GroupDialog = ({
  group,
  open,
  roleLabel,
  onOpenChange
}: {
  group?: OrgGroup;
  open: boolean;
  roleLabel?: string;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data, update, saved } = useAccess();
  const isCreate = !group;
  const [name, setName] = useState(group?.name ?? "");
  const [slug, setSlug] = useState(group?.slug ?? "");
  const [slugDirty, setSlugDirty] = useState(false);
  const [role, setRole] = useState(group?.role ?? data.defaultOrgRole);
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCreate ? "Create group" : "Update group"}</DialogTitle>
        </DialogHeader>
        <form
          id="org-group"
          onSubmit={(event) => {
            event.preventDefault();
            const next = {
              name: nameError(name),
              slug: slugError(slug)
            };
            setErrors(next);
            if (next.name || next.slug) return;
            setPending(true);
            window.setTimeout(() => {
              update((current) => {
                if (!group)
                  return {
                    ...current,
                    orgGroups: [
                      ...current.orgGroups,
                      {
                        id: `g-${crypto.randomUUID()}`,
                        name: name.trim(),
                        slug,
                        role,
                        memberIds: [],
                        createdAt: ADDED_TODAY
                      }
                    ]
                  };
                const renamed = {
                  ...current,
                  orgGroups: current.orgGroups.map((item) =>
                    item.id === group.id ? { ...item, name: name.trim(), slug } : item
                  ),
                  orgMembers: current.orgMembers.map((member) => ({
                    ...member,
                    groups: member.groups.map((ref) =>
                      ref.id === group.id ? { ...ref, name: name.trim() } : ref
                    )
                  }))
                };
                return setGroupRole(renamed, group.id, role);
              });
              setPending(false);
              saved(`Successfully ${isCreate ? "created" : "updated"} group`);
              onOpenChange(false);
            }, 400);
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
            <Field label={roleLabel ?? (isCreate ? "Role" : "Update role")}>
              <Select
                label={roleLabel ?? (isCreate ? "Role" : "Update role")}
                placeholder="Select role..."
                value={role}
                options={roleOptions(data.orgRoles)}
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
