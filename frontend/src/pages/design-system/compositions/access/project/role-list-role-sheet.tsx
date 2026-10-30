import { useState } from "react";
import slugify from "@sindresorhus/slugify";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack, Inline } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { slugSchema } from "@app/lib/schemas";

import { useAccess } from "../context";
import type { Role } from "../model";

export type RoleSheetMode =
  | { kind: "create"; prefill?: { name: string; description: string } }
  | { kind: "duplicate"; source: Role };

const toSlug = (value: string) => slugify(value, { lowercase: true });

export const RoleListRoleSheet = ({
  open,
  mode,
  onOpenChange
}: {
  open: boolean;
  mode: RoleSheetMode;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data, update, saved, navigate } = useAccess();
  const duplicate = mode.kind === "duplicate";
  const initialName =
    mode.kind === "duplicate" ? `${mode.source.name} Duplicate` : (mode.prefill?.name ?? "");
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(() => toSlug(initialName));
  const [slugDirty, setSlugDirty] = useState(false);
  const [description, setDescription] = useState(
    mode.kind === "create" ? (mode.prefill?.description ?? "") : ""
  );
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const parsedSlug = slugSchema({ min: 1 }).safeParse(slug);
  const slugTaken = data.projectRoles.some((role) => role.slug === slug.trim());
  const nameError = submitted && !name ? "Name required" : undefined;
  const slugError = (() => {
    if (!parsedSlug.success && (submitted || slugDirty || name))
      return parsedSlug.error.issues[0]?.message;
    if (submitted && slugTaken) return "A role with this slug already exists";
    return undefined;
  })();

  const submit = () => {
    setSubmitted(true);
    if (!name || !parsedSlug.success || slugTaken) return;
    setPending(true);
    window.setTimeout(() => {
      const role: Role = {
        id: `p-${crypto.randomUUID()}`,
        slug: parsedSlug.data,
        name,
        description,
        builtIn: false
      };
      update((current) => ({ ...current, projectRoles: [...current.projectRoles, role] }));
      setPending(false);
      saved(`Project role "${name}" ${duplicate ? "duplicated" : "created"}`);
      onOpenChange(false);
      navigate({ detail: { kind: "project-role", id: role.id, label: role.name } });
    }, 500);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{duplicate ? "Duplicate role" : "Create role"}</SheetTitle>
          <SheetDescription>
            {mode.kind === "duplicate"
              ? `Create a new role with the same permissions as ${mode.source.name}.`
              : "Create a custom project role. You can configure its permissions after creation."}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id="project-role-form"
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <Field label="Name" error={nameError}>
                <Input
                  autoFocus
                  placeholder="Billing team"
                  data-1p-ignore
                  value={name}
                  invalid={Boolean(nameError)}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (!slugDirty) setSlug(toSlug(event.target.value));
                  }}
                />
              </Field>
              <Field label="Slug" error={slugError}>
                <Input
                  mono
                  placeholder="billing"
                  data-1p-ignore
                  value={slug}
                  invalid={Boolean(slugError)}
                  onChange={(event) => {
                    setSlug(event.target.value);
                    setSlugDirty(true);
                  }}
                />
              </Field>
              <Field label="Description">
                <Input
                  placeholder="Manage billing settings"
                  data-1p-ignore
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="project-role-form" loading={pending}>
              {duplicate ? "Duplicate role" : "Create role"}
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
