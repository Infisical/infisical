import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import slugify from "@sindresorhus/slugify";

import type { TProjectRole } from "@app/hooks/api/roles/types";
import { slugSchema } from "@app/lib/schemas";
import { sanitizeDuplicateRolePermissions } from "@app/pages/project/RoleDetailsBySlugPage/components/DuplicateProjectRoleModal.utils";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { failed, saved } from "../toast";
import { accessLabel } from "./product";
import { useProjectScope } from "./scope";

export type RoleSheetMode =
  | { kind: "create" }
  | { kind: "duplicate"; source: Pick<TProjectRole, "id" | "name" | "slug"> };

const toSlug = (value: string) => slugify(value, { lowercase: true });

export const RoleListRoleSheet = ({
  projectId,
  roles,
  open,
  mode,
  onOpenChange
}: {
  projectId: string;
  roles: readonly Pick<TProjectRole, "slug">[];
  open: boolean;
  mode: RoleSheetMode;
  onOpenChange: (open: boolean) => void;
}) => {
  const scope = useProjectScope();
  const go = useGo();
  const access = useV4Adapter("access");
  const createRole = access.useCreateProjectRole();
  const duplicate = mode.kind === "duplicate";
  const { data: source } = access.useProjectRole(
    projectId,
    mode.kind === "duplicate" ? mode.source.slug : "",
    scope.projectType
  );
  const initialName = mode.kind === "duplicate" ? `${mode.source.name} Duplicate` : "";
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(() => toSlug(initialName));
  const [slugDirty, setSlugDirty] = useState(false);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const parsedSlug = slugSchema({ min: 1 }).safeParse(slug);
  const slugTaken = roles.some((role) => role.slug === slug.trim());
  const nameError = submitted && !name ? "Name required" : undefined;
  const slugError = (() => {
    if (!parsedSlug.success && (submitted || slugDirty || name))
      return parsedSlug.error.issues[0]?.message;
    if (submitted && slugTaken) return "A role with this slug already exists";
    return undefined;
  })();

  const submit = async () => {
    setSubmitted(true);
    if (!name || !parsedSlug.success || slugTaken) return;
    if (duplicate && !source) return;
    setPending(true);
    try {
      const role = await createRole.mutateAsync({
        projectId,
        projectType: scope.projectType,
        name,
        slug: parsedSlug.data,
        description,
        permissions: source ? sanitizeDuplicateRolePermissions(source.permissions) : []
      });
      saved(
        `${accessLabel(scope.projectType, "role")} "${name}" ${duplicate ? "duplicated" : "created"}`
      );
      onOpenChange(false);
      go(accessLinks.projectRole(scope, role.slug));
    } catch (error) {
      failed(
        duplicate
          ? `Failed to duplicate ${accessLabel(scope.projectType, "role").toLowerCase()}`
          : `Failed to create ${accessLabel(scope.projectType, "role").toLowerCase()}`,
        error
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>{duplicate ? "Duplicate role" : "Create role"}</SheetTitle>
          <SheetDescription>
            {mode.kind === "duplicate"
              ? `Copies the permissions of ${mode.source.name}.`
              : "You set its permissions after it's created."}
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
            <Button
              variant="primary"
              type="submit"
              form="project-role-form"
              loading={pending}
              disabled={duplicate && !source}
            >
              {duplicate ? "Duplicate role" : "Create role"}
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
