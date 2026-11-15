import { useMemo, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import slugify from "@sindresorhus/slugify";

import type { TProjectTemplate } from "@app/hooks/api/projectTemplates";
import { slugSchema } from "@app/lib/schemas";

import { useOrgId } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";

type EnvRow = { id: string; name: string; slug: string; isNew: boolean; slugTouched: boolean };

const rowsFrom = (template: TProjectTemplate): EnvRow[] =>
  [...(template.environments ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((environment) => ({
      id: crypto.randomUUID(),
      name: environment.name,
      slug: environment.slug,
      isNew: false,
      slugTouched: true
    }));

const errorsOf = (row: EnvRow) => ({
  name: row.name.trim() ? undefined : "Name is required",
  slug: slugSchema({ min: 1, max: 64 }).safeParse(row.slug).error?.issues[0]?.message
});

const ReadOnlyEnvironments = ({ template }: { template: TProjectTemplate }) => {
  const rows = rowsFrom(template);
  return (
    <SettingsCard flush title="Environments">
      <DataTable
        label="Environments"
        rows={rows}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.name}
        columns={[
          { id: "name", header: "Name", primary: true, grow: true, render: (row) => row.name },
          { id: "slug", header: "Slug", mono: true, grow: true, render: (row) => row.slug }
        ]}
      />
    </SettingsCard>
  );
};

export const TemplateEnvironmentsCard = ({
  template,
  canEdit,
  readOnly
}: {
  template: TProjectTemplate;
  canEdit: boolean;
  readOnly: boolean;
}) => {
  const orgId = useOrgId();
  const productSettings = useV4Adapter("productSettings");
  const update = productSettings.useUpdateProjectTemplate();
  const { data: subscription } = productSettings.useSubscription(orgId);
  const stored = useMemo(() => rowsFrom(template), [template]);
  const [draft, setDraft] = useState<EnvRow[]>();
  const [showErrors, setShowErrors] = useState(false);
  if (readOnly) return <ReadOnlyEnvironments template={template} />;
  const rows = draft ?? stored;
  const serialize = (list: EnvRow[]) => JSON.stringify(list.map(({ name, slug }) => [name, slug]));
  const dirty = draft !== undefined && serialize(draft) !== serialize(stored);
  const limit = subscription?.environmentLimit ?? 0;
  const limitReached = Boolean(limit) && rows.length >= limit;
  const change = (id: string, patch: Partial<EnvRow>) =>
    setDraft(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const columns: DataTableColumn<EnvRow>[] = [
    {
      id: "name",
      header: "Name",
      grow: true,
      render: (row) => {
        const error = showErrors ? errorsOf(row).name : undefined;
        return (
          <Input
            size="sm"
            aria-label="Environment name"
            placeholder="Name"
            data-1p-ignore
            disabled={!canEdit}
            invalid={Boolean(error)}
            title={error}
            value={row.name}
            onChange={(event) =>
              change(row.id, {
                name: event.target.value,
                ...(row.isNew && !row.slugTouched
                  ? { slug: slugify(event.target.value, { lowercase: true }) }
                  : {})
              })
            }
          />
        );
      }
    },
    {
      id: "slug",
      header: "Slug",
      grow: true,
      render: (row) => {
        const error = showErrors ? errorsOf(row).slug : undefined;
        return (
          <Input
            size="sm"
            mono
            aria-label="Environment slug"
            placeholder="slug"
            data-1p-ignore
            disabled={!canEdit}
            invalid={Boolean(error)}
            title={error}
            value={row.slug}
            onChange={(event) => change(row.id, { slug: event.target.value, slugTouched: true })}
          />
        );
      }
    }
  ];

  return (
    <SettingsCard
      title="Environments"
      dirty={dirty}
      saveDisabledReason={canEdit ? undefined : RESTRICTED}
      onDiscard={() => {
        setDraft(undefined);
        setShowErrors(false);
      }}
      onSave={async () => {
        const invalid = rows.find((row) => {
          const found = errorsOf(row);
          return found.name || found.slug;
        });
        if (invalid) {
          setShowErrors(true);
          failed("Fix the highlighted environments, then save again.");
          return;
        }
        try {
          await update.mutateAsync({
            templateId: template.id,
            environments: rows.map((row, index) => ({
              name: row.name.trim(),
              slug: row.slug,
              position: index + 1
            }))
          });
        } catch (error) {
          failed("Failed to update template environments", error);
          return;
        }
        setDraft(undefined);
        setShowErrors(false);
        saved("Template environments updated");
      }}
      action={
        <Button
          variant="outline"
          icon="plus"
          disabledReason={
            (!canEdit && RESTRICTED) ||
            (limitReached
              ? `Your plan allows ${limit} environments. Contact Infisical to raise the limit.`
              : undefined)
          }
          onClick={() =>
            setDraft([
              ...rows,
              { id: crypto.randomUUID(), name: "", slug: "", isNew: true, slugTouched: false }
            ])
          }
        >
          Add environment
        </Button>
      }
    >
      {rows.length ? (
        <DataTable
          label="Environments"
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name || "New environment"}
          reorder={canEdit ? { onReorder: setDraft } : undefined}
          rowActions={{
            menuDisabledReason: () => (canEdit ? undefined : RESTRICTED),
            renderMenu: (row) => (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDraft(rows.filter((item) => item.id !== row.id))}
              >
                <Icon name="trash" />
                Remove environment
              </DropdownMenuItem>
            )
          }}
        />
      ) : (
        <EmptyState size="sm" icon="layout-grid" title="No environments in this template" />
      )}
    </SettingsCard>
  );
};
