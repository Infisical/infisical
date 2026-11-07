import { useState } from "react";
import slugify from "@sindresorhus/slugify";

import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
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
import { slugSchema } from "@app/lib/schemas/slugSchema";

import styles from "./roles.module.css";

export type RoleDraft = { name: string; slug: string; description: string };
type Role = { name: string; slug: string; description?: string | null };
type Errors = Partial<Record<keyof RoleDraft, string>>;

const validate = (draft: RoleDraft, taken: readonly string[]): Errors => {
  const errors: Errors = {};
  if (!draft.name.trim()) errors.name = "Name required";
  const slug = slugSchema({ min: 1 }).safeParse(draft.slug);
  if (!slug.success) errors.slug = slug.error.issues[0]?.message;
  else if (taken.includes(draft.slug.trim())) errors.slug = "A role with this slug already exists";
  return errors;
};

const duplicateDraft = (role: Role): RoleDraft => ({
  name: `${role.name} Duplicate`,
  slug: slugify(`${role.name} Duplicate`, { lowercase: true }),
  description: ""
});

const RoleFields = ({
  formId,
  draft,
  errors,
  autoSlug,
  descriptionOptional,
  descriptionPlaceholder,
  onChange
}: {
  formId: string;
  draft: RoleDraft;
  errors: Errors;
  autoSlug: boolean;
  descriptionOptional: boolean;
  descriptionPlaceholder: string;
  onChange: (draft: RoleDraft, slugTouched?: boolean) => void;
}) => (
  <Stack gap={16}>
    <Field label="Name" error={errors.name}>
      <Input
        id={`${formId}-name`}
        placeholder="Billing Team"
        autoComplete="off"
        data-1p-ignore
        invalid={Boolean(errors.name)}
        value={draft.name}
        onChange={(event) =>
          onChange({
            ...draft,
            name: event.target.value,
            slug: autoSlug ? slugify(event.target.value, { lowercase: true }) : draft.slug
          })
        }
      />
    </Field>
    <Field label="Slug" error={errors.slug}>
      <Input
        id={`${formId}-slug`}
        placeholder="billing"
        mono
        autoComplete="off"
        data-1p-ignore
        invalid={Boolean(errors.slug)}
        value={draft.slug}
        onChange={(event) => onChange({ ...draft, slug: event.target.value }, true)}
      />
    </Field>
    <Field label="Description" optional={descriptionOptional}>
      <Input
        id={`${formId}-description`}
        placeholder={descriptionPlaceholder}
        autoComplete="off"
        data-1p-ignore
        value={draft.description}
        onChange={(event) => onChange({ ...draft, description: event.target.value })}
      />
    </Field>
  </Stack>
);

const useRoleForm = (
  initial: () => RoleDraft,
  taken: readonly string[],
  autoSlug: boolean,
  onSubmit: (draft: RoleDraft) => Promise<void>
) => {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [slugTouched, setSlugTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const check = () => {
    const next = validate(draft, taken);
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  return {
    draft,
    errors,
    pending,
    autoSlug: autoSlug && !slugTouched,
    change: (next: RoleDraft, touched?: boolean) => {
      if (touched) setSlugTouched(true);
      setDraft(next);
      if (Object.keys(errors).length) setErrors(validate(next, taken));
    },
    reset: () => {
      setDraft(initial());
      setErrors({});
      setSlugTouched(false);
    },
    submit: async () => {
      if (!check()) return;
      setPending(true);
      try {
        await onSubmit(draft);
      } finally {
        setPending(false);
      }
    }
  };
};

export const OrgRoleDialog = ({
  role,
  mode,
  taken,
  open,
  onOpenChange,
  onSubmit
}: {
  role: Role;
  mode: "update" | "duplicate";
  taken: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: RoleDraft) => Promise<void>;
}) => {
  const form = useRoleForm(
    () =>
      mode === "update"
        ? { name: role.name, slug: role.slug, description: role.description ?? "" }
        : duplicateDraft(role),
    taken,
    mode === "duplicate",
    onSubmit
  );
  const formId = `org-role-${mode}`;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        form.reset();
      }}
    >
      <DialogContent className={styles.formDialog} pending={form.pending}>
        <DialogHeader>
          <DialogTitle>{mode === "update" ? "Update role" : "Duplicate role"}</DialogTitle>
          {mode === "duplicate" && (
            <DialogDescription>Creates a new role with the same permissions.</DialogDescription>
          )}
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            form.submit();
          }}
        >
          <RoleFields
            formId={formId}
            draft={form.draft}
            errors={form.errors}
            autoSlug={form.autoSlug}
            descriptionOptional
            descriptionPlaceholder="To manage billing"
            onChange={form.change}
          />
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={form.pending}>
            {mode === "update" ? "Update" : "Duplicate role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ProjectRoleSheet = ({
  role,
  mode,
  taken,
  open,
  onOpenChange,
  onSubmit
}: {
  role: Role;
  mode: "update" | "duplicate";
  taken: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: RoleDraft) => Promise<void>;
}) => {
  const form = useRoleForm(
    () =>
      mode === "update"
        ? { name: role.name, slug: role.slug, description: role.description ?? "" }
        : duplicateDraft(role),
    taken,
    mode === "duplicate",
    onSubmit
  );
  const formId = `project-role-${mode}`;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) form.reset();
      }}
    >
      <SheetContent pending={form.pending}>
        <SheetHeader>
          <SheetTitle>{mode === "update" ? "Edit role" : "Duplicate role"}</SheetTitle>
          {mode === "duplicate" && (
            <SheetDescription>{`Creates a new role with the same permissions as ${role.name}.`}</SheetDescription>
          )}
        </SheetHeader>
        <SheetBody>
          <form
            id={formId}
            noValidate
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              form.submit();
            }}
          >
            <RoleFields
              formId={formId}
              draft={form.draft}
              errors={form.errors}
              autoSlug={form.autoSlug}
              descriptionOptional={false}
              descriptionPlaceholder="Manage billing settings"
              onChange={form.change}
            />
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={form.pending}>
              {mode === "update" ? "Save changes" : "Duplicate role"}
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
