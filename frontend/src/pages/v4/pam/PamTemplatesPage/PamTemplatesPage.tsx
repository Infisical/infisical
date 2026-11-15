import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Meta } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  PamAccountType,
  type TPamAccountTemplateWithCount,
  type TPamAccountTypeMetadata
} from "@app/hooks/api/pam";
import { PamSheetTab, usePamSheetState } from "@app/hooks/usePamSheetState";
import { slugSchema } from "@app/lib/schemas";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { TemplateSheet } from "./template-sheet";

const createSchema = z.object({
  name: slugSchema({ field: "Name" }),
  type: z.nativeEnum(PamAccountType, { required_error: "Select an account type" }),
  description: z.string().max(256).optional()
});

type CreateForm = z.infer<typeof createSchema>;

const CreateTemplateSheet = ({
  open,
  onOpenChange,
  accountTypes,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountTypes: TPamAccountTypeMetadata[];
  onCreated: (templateId: string) => void;
}) => {
  const createTemplate = useV4Adapter("pam").useCreateTemplate();
  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", description: "" }
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const close = () => {
    form.reset();
    onOpenChange(false);
  };
  const guard = useDiscardChangesGuard({ isDirty, onDiscard: close });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const template = await createTemplate.mutateAsync({
        name: values.name,
        type: values.type,
        description: values.description || undefined
      });
      saved(`Template "${values.name}" created`);
      close();
      onCreated(template.id);
    } catch (error) {
      failed("Could not create the template", error);
    }
  });

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else guard.requestDiscard();
        }}
      >
        <SheetContent size="sm" pending={isSubmitting}>
          <SheetHeader>
            <SheetTitle>Create template</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <form id="create-pam-template" onSubmit={onSubmit}>
              <Stack gap={16}>
                <Field label="Name" error={errors.name?.message}>
                  <Input
                    {...form.register("name")}
                    placeholder="production-postgresql"
                    invalid={Boolean(errors.name)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Account type" error={errors.type?.message}>
                  <Select
                    label="Account type"
                    placeholder="Select an account type"
                    value={form.watch("type") ?? ""}
                    invalid={Boolean(errors.type)}
                    options={accountTypes.map((meta) => ({ value: meta.type, label: meta.name }))}
                    onValueChange={(value) =>
                      form.setValue("type", value as PamAccountType, {
                        shouldDirty: true,
                        shouldValidate: true
                      })
                    }
                  />
                </Field>
                <Field label="Description" optional error={errors.description?.message}>
                  <Textarea
                    {...form.register("description")}
                    rows={3}
                    aria-invalid={Boolean(errors.description) || undefined}
                  />
                </Field>
              </Stack>
            </form>
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={guard.requestDiscard}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-pam-template"
              variant="accent"
              loading={isSubmitting}
            >
              Create template
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="The template you started will be lost."
      />
    </>
  );
};

const DeleteTemplateDialog = ({
  template,
  onClose
}: {
  template?: TPamAccountTemplateWithCount;
  onClose: () => void;
}) => {
  const deleteTemplate = useV4Adapter("pam").useDeleteTemplate();
  const [deleting, setDeleting] = useState(false);
  const count = template?.accountCount ?? 0;
  const plural = count === 1 ? "it" : "them";

  return (
    <AlertDialog open={Boolean(template)} onOpenChange={(open) => !open && onClose()}>
      {count > 0 ? (
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${template?.name}"`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`This template is used by ${count} account${count === 1 ? "" : "s"}. Move ${plural} to another template or delete ${plural} first.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : (
        <AlertDialogContent size="sm" tone="danger" confirmText={template?.name} pending={deleting}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${template?.name}"`}</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the template. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={deleting}
              onClick={async () => {
                if (!template) return;
                setDeleting(true);
                try {
                  await deleteTemplate.mutateAsync({ templateId: template.id });
                  saved(`Template "${template.name}" deleted`);
                  onClose();
                } catch (error) {
                  failed("Could not delete the template", error);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
};

const dismissedKey = (actionKey: string) => `infisical:dismissed-alert:${actionKey}`;

const MissingTemplatesAlert = ({
  templates,
  accountTypes
}: {
  templates: TPamAccountTemplateWithCount[];
  accountTypes: TPamAccountTypeMetadata[];
}) => {
  const createTemplate = useV4Adapter("pam").useCreateTemplate();
  const [adding, setAdding] = useState(false);
  const missing = useMemo(() => {
    const covered = new Set(templates.map((template) => template.type));
    return accountTypes.filter((meta) => !covered.has(meta.type));
  }, [templates, accountTypes]);
  const actionKey = `pam_missing_templates_${missing.map((meta) => meta.type).join("_")}`;
  const [dismissed, setDismissed] = useState<string[]>([]);

  if (
    missing.length === 0 ||
    dismissed.includes(actionKey) ||
    localStorage.getItem(dismissedKey(actionKey)) === "true"
  )
    return null;

  const handleAdd = async () => {
    setAdding(true);
    const results = await Promise.allSettled(
      missing.map((meta) => createTemplate.mutateAsync({ name: meta.type, type: meta.type }))
    );
    setAdding(false);
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    if (failures.length === results.length) {
      failed("Could not add the default templates", failures[0]?.reason);
      return;
    }
    toast({
      tone: failures.length ? "neutral" : "ok",
      title: failures.length
        ? `Added ${results.length - failures.length} of ${results.length} default templates`
        : `Added ${results.length} default template${results.length === 1 ? "" : "s"}`
    });
  };

  return (
    <Alert
      tone="info"
      title={`${missing.length} account type${missing.length === 1 ? "" : "s"} without a template`}
      onDismiss={() => {
        localStorage.setItem(dismissedKey(actionKey), "true");
        setDismissed((current) => [...current, actionKey]);
      }}
      actions={
        <Button variant="outline" size="sm" loading={adding} onClick={handleAdd}>
          {`Add default template${missing.length === 1 ? "" : "s"}`}
        </Button>
      }
    >
      {`Accounts can't be created for ${missing.map((meta) => meta.name).join(", ")} until a template exists.`}
    </Alert>
  );
};

export const PamTemplatesPage = () => {
  const pam = useV4Adapter("pam");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TPamAccountTemplateWithCount>();
  const sheet = usePamSheetState("templateId");

  const { data: templates, isPending } = pam.useTemplates();
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const typeMap = useMemo(
    () => new Map(accountTypes.map((meta) => [meta.type, meta])),
    [accountTypes]
  );

  const selectedType = filters.find((filter) => filter.field === "type")?.values[0];
  const query = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (templates ?? []).filter(
        (template) =>
          (!selectedType || template.type === selectedType) &&
          (!query || `${template.name} ${template.description ?? ""}`.toLowerCase().includes(query))
      ),
    [templates, selectedType, query]
  );
  const isFiltered = Boolean(query || selectedType);

  const columns: DataTableColumn<TPamAccountTemplateWithCount>[] = [
    {
      id: "name",
      header: "Template",
      primary: true,
      grow: true,
      text: (row) => row.name,
      render: (row) => {
        const meta = typeMap.get(row.type);
        return (
          <Inline gap={8} align="center" wrap={false}>
            {meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="sm" />}
            <Button
              variant="link"
              underline="hover"
              title={row.name}
              onClick={() => sheet.openSheet(row.id)}
            >
              {row.name}
            </Button>
          </Inline>
        );
      },
      secondary: (row) => row.description ?? typeMap.get(row.type)?.name ?? row.type
    },
    {
      id: "accounts",
      header: "Accounts",
      width: 128,
      render: (row) => (
        <Meta
          mono={false}
        >{`${row.accountCount} account${row.accountCount === 1 ? "" : "s"}`}</Meta>
      )
    }
  ];

  return (
    <TooltipProvider>
      <PageTitle title="Account Templates" />
      <Stack gap={24}>
        <PageHeader
          title="Account templates"
          badges={
            <DocumentationLink
              href="https://infisical.com/docs/documentation/platform/pam/templates/overview"
              subject="account templates"
            />
          }
          actions={
            <Button variant="accent" icon="plus" onClick={() => setCreating(true)}>
              Create template
            </Button>
          }
        />
        {templates && <MissingTemplatesAlert templates={templates} accountTypes={accountTypes} />}
        <FilterBar
          label="Template filters"
          fields={[
            {
              key: "type",
              label: "Type",
              type: "select",
              searchable: true,
              options: accountTypes.map((meta) => ({ value: meta.type, label: meta.name }))
            }
          ]}
          value={filters}
          onChange={setFilters}
          search={
            <Input
              icon="search"
              aria-label="Search templates"
              placeholder="Search by name or description..."
              slashShortcut
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          }
        />
        <DataTable
          label="Account templates"
          rows={rows}
          columns={columns}
          loading={isPending}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          // v4-check-ignore row-activate-navigates -- opens the template sheet in place; the search param only keeps it addressable
          onRowActivate={(row) => sheet.openSheet(row.id)}
          rowActions={{
            menuLabel: "Template options",
            renderMenu: (row) => (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard.writeText(row.id);
                    toast({ tone: "ok", title: "Template ID copied to clipboard" });
                  }}
                >
                  <Icon name="copy" />
                  Copy template ID
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => sheet.openSheet(row.id, PamSheetTab.General)}>
                  <Icon name="settings" />
                  General
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => sheet.openSheet(row.id, PamSheetTab.Configuration)}
                >
                  <Icon name="pencil" />
                  Configuration
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                  <Icon name="trash" />
                  Delete template
                </DropdownMenuItem>
              </>
            )
          }}
          empty={
            isFiltered ? (
              <EmptyState
                size="sm"
                media="bare"
                icon="search"
                title="No templates match your filters"
                actions={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setFilters([]);
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                size="sm"
                media="bare"
                icon="file"
                title="No templates yet"
                actions={
                  <Button variant="outline" icon="plus" onClick={() => setCreating(true)}>
                    Create template
                  </Button>
                }
              />
            )
          }
        />
      </Stack>
      <CreateTemplateSheet
        open={creating}
        onOpenChange={setCreating}
        accountTypes={accountTypes}
        onCreated={(templateId) => sheet.openSheet(templateId)}
      />
      <TemplateSheet
        templateId={sheet.selectedId}
        tab={
          sheet.tab === PamSheetTab.Configuration ? PamSheetTab.Configuration : PamSheetTab.General
        }
        onTabChange={sheet.setTab}
        onClose={sheet.closeSheet}
      />
      <DeleteTemplateDialog template={deleting} onClose={() => setDeleting(undefined)} />
    </TooltipProvider>
  );
};
