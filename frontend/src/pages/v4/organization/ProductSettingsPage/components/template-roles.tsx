import { useId, useState, useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import slugify from "@sindresorhus/slugify";
import { ServerIcon, WrenchIcon } from "lucide-react";

import { isCustomProjectRole } from "@app/helpers/roles";
import type { TProjectTemplate } from "@app/hooks/api/projectTemplates";
import { slugSchema } from "@app/lib/schemas";

import { failed, saved } from "../../../access/toast";
import { RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useGo } from "../../../links";
import { customRoles, roleUsage } from "./template-role-usage";

import styles from "./product-settings.module.css";

type TemplateRole = TProjectTemplate["roles"][number];

const AddRoleDialog = ({
  template,
  onOpenChange,
  onCreated
}: {
  template: TProjectTemplate;
  onOpenChange: (open: boolean) => void;
  onCreated: (slug: string) => void;
}) => {
  const update = useV4Adapter("productSettings").useUpdateProjectTemplate();
  const formId = useId();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const slugTouched = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const parsedSlug = slugSchema({ min: 1 }).safeParse(slug);
  const taken = template.roles.some((role) => role.slug === slug.trim());
  const nameError = submitted && !name.trim() ? "Name required" : undefined;
  let slugError: string | undefined;
  if (submitted && !parsedSlug.success) slugError = parsedSlug.error.issues[0]?.message;
  else if (submitted && taken) slugError = "A role with this slug already exists";

  const submit = async () => {
    setSubmitted(true);
    if (!name.trim() || !parsedSlug.success || taken) return;
    setPending(true);
    try {
      await update.mutateAsync({
        templateId: template.id,
        roles: [
          ...customRoles(template),
          { name: name.trim(), slug: parsedSlug.data, permissions: [] }
        ]
      });
      saved(`Role "${name.trim()}" added to template`);
      onOpenChange(false);
      onCreated(parsedSlug.data);
    } catch (error) {
      failed("Failed to add role to template", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Add role</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field label="Name" error={nameError}>
              <Input
                placeholder="Deployer"
                data-1p-ignore
                invalid={Boolean(nameError)}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!slugTouched.current)
                    setSlug(slugify(event.target.value, { lowercase: true }));
                }}
              />
            </Field>
            <Field label="Slug" error={slugError}>
              <Input
                mono
                placeholder="deployer"
                data-1p-ignore
                invalid={Boolean(slugError)}
                value={slug}
                onChange={(event) => {
                  setSlug(event.target.value);
                  slugTouched.current = true;
                }}
              />
            </Field>
          </Stack>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={formId} variant="primary" loading={pending}>
            Add role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const TemplateRolesCard = ({
  template,
  canEdit,
  readOnly,
  roleHref
}: {
  template: TProjectTemplate;
  canEdit: boolean;
  readOnly: boolean;
  roleHref: (slug: string) => string;
}) => {
  const go = useGo();
  const update = useV4Adapter("productSettings").useUpdateProjectTemplate();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TemplateRole>();

  const remove = async (role: TemplateRole) => {
    const usage = roleUsage(template, role.slug);
    if (usage.length) {
      failed(`Cannot remove role "${role.slug}" because it is assigned to ${usage.join(", ")}`);
      return;
    }
    try {
      await update.mutateAsync({
        templateId: template.id,
        roles: customRoles(template).filter((item) => item.slug !== role.slug)
      });
      saved(`Role "${role.name}" removed from template`);
    } catch (error) {
      failed("Failed to remove role from template", error);
    }
  };

  const columns: DataTableColumn<TemplateRole>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (role) => role.name,
      render: (role) => (
        <RowLink link={go.link(roleHref(role.slug))} title={role.name}>
          {role.name}
        </RowLink>
      )
    },
    { id: "slug", header: "Slug", mono: true, grow: true, render: (role) => role.slug },
    {
      id: "source",
      header: "Source",
      width: 120,
      render: (role) => (
        <span className={styles.source}>
          <Icon icon={isCustomProjectRole(role.slug) ? WrenchIcon : ServerIcon} size={12} />
          {isCustomProjectRole(role.slug) ? "Custom" : "Platform"}
        </span>
      )
    }
  ];

  return (
    <>
      <SettingsCard
        flush
        title="Roles"
        action={
          !readOnly && (
            <Button
              variant="outline"
              icon="plus"
              disabledReason={canEdit ? undefined : RESTRICTED}
              onClick={() => setAdding(true)}
            >
              Add role
            </Button>
          )
        }
      >
        {template.roles.length ? (
          <DataTable
            label="Template roles"
            rows={template.roles}
            columns={columns}
            getRowId={(role) => role.slug}
            rowLabel={(role) => role.name}
            rowActions={
              readOnly
                ? undefined
                : {
                    renderMenu: (role) => {
                      const reason =
                        (!isCustomProjectRole(role.slug) && "Built-in roles cannot be removed") ||
                        (canEdit ? undefined : RESTRICTED);
                      return (
                        <>
                          <DropdownMenuItem onSelect={() => go(roleHref(role.slug))}>
                            <Icon name={isCustomProjectRole(role.slug) ? "pencil" : "eye"} />
                            {isCustomProjectRole(role.slug) ? "Edit role" : "View role"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={Boolean(reason)}
                            description={reason || undefined}
                            onSelect={() => setRemoving(role)}
                          >
                            <Icon name="trash" />
                            Remove role
                          </DropdownMenuItem>
                        </>
                      );
                    }
                  }
            }
          />
        ) : (
          <EmptyState size="sm" icon="lock" title="No roles in this template" />
        )}
      </SettingsCard>
      {adding && (
        <AddRoleDialog
          template={template}
          onOpenChange={setAdding}
          onCreated={(slug) => go(roleHref(slug))}
        />
      )}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={removing?.slug ?? ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove "${removing?.name ?? "role"}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the role and its policies from this template. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing) remove(removing);
                setRemoving(undefined);
              }}
            >
              Remove role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
