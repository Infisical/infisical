import { useEffect, useState } from "react";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { DataList, type DataListItem } from "@app/components/v4/ui/list";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import { Switch } from "@app/components/v4/ui/switch";
import { Textarea } from "@app/components/v4/ui/textarea";
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  doesDataSourceSupportDiscovery,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2/enums";
import type { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2/types";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";
import { slugSchema } from "@app/lib/schemas";

import { useProjectPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";

type Toggle = "isScanNewCommitsEnabled" | "isHistoricalScanEnabled" | "isDiscoveryEnabled";

const detailsSchema = z.object({
  name: slugSchema({ field: "Name" }),
  description: z.string().trim().max(256, "Cannot exceed 256 characters")
});

const configItems = (dataSource: TSecretScanningDataSource): DataListItem[] => {
  const items: DataListItem[] = [];
  if (dataSource.connection)
    items.push([
      "App connection",
      `${dataSource.connection.name} (${APP_CONNECTION_MAP[SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[dataSource.type]].name})`
    ]);
  if (dataSource.type === SecretScanningDataSource.Bitbucket)
    items.push(["Workspace slug", <code key="workspace">{dataSource.config.workspaceSlug}</code>]);
  if (dataSource.type === SecretScanningDataSource.GitLab) {
    const { config } = dataSource;
    if (config.scope === GitLabDataSourceScope.Project)
      items.push(["Scope", "Project"], ["Project", config.projectName || String(config.projectId)]);
    else
      items.push([
        "Group",
        config.scope === GitLabDataSourceScope.Group
          ? config.groupName || String(config.groupId)
          : "None (all accessible projects)"
      ]);
  }
  return items;
};

const General = ({
  dataSource,
  canEdit
}: {
  dataSource: TSecretScanningDataSource;
  canEdit: boolean;
}) => {
  const update = useV4Adapter("secretScanning").useUpdateDataSource();
  const initial = { name: dataSource.name, description: dataSource.description ?? "" };
  const [draft, setDraft] = useState(initial);
  const [showIssues, setShowIssues] = useState(false);

  useEffect(() => {
    setDraft({ name: dataSource.name, description: dataSource.description ?? "" });
  }, [dataSource.name, dataSource.description]);

  const parsed = detailsSchema.safeParse(draft);
  const issues = showIssues && !parsed.success ? parsed.error.flatten().fieldErrors : undefined;

  return (
    <SettingsCard
      title="General"
      dirty={draft.name !== initial.name || draft.description !== initial.description}
      locked={canEdit ? undefined : RESTRICTED}
      onDiscard={() => {
        setDraft(initial);
        setShowIssues(false);
      }}
      onSave={async () => {
        if (!parsed.success) {
          setShowIssues(true);
          throw new Error("Fix the highlighted fields, then save again.");
        }
        try {
          await update.mutateAsync({
            dataSourceId: dataSource.id,
            type: dataSource.type,
            projectId: dataSource.projectId,
            name: parsed.data.name,
            description: parsed.data.description || null
          });
        } catch (error) {
          failed("Failed to update data source", error);
          throw error;
        }
        saved(`Updated ${parsed.data.name}`);
      }}
    >
      <Stack gap={16}>
        <Field label="Name" error={issues?.name?.[0]}>
          <Input
            value={draft.name}
            invalid={Boolean(issues?.name)}
            autoComplete="off"
            disabled={!canEdit}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>
        <Field label="Description" optional error={issues?.description?.[0]}>
          <Textarea
            rows={2}
            value={draft.description}
            disabled={!canEdit}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </Field>
      </Stack>
    </SettingsCard>
  );
};

const Scanning = ({
  dataSource,
  canEdit
}: {
  dataSource: TSecretScanningDataSource;
  canEdit: boolean;
}) => {
  const update = useV4Adapter("secretScanning").useUpdateDataSource();
  const [pending, setPending] = useState<Toggle>();
  const platform = SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type].name;
  const { pluralNoun } = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  const supportsDiscovery = doesDataSourceSupportDiscovery(dataSource);
  const items = configItems(dataSource);
  const toggles: { name: Toggle; label: string; description: string; blocked?: boolean }[] = [
    {
      name: "isScanNewCommitsEnabled",
      label: "Scan new commits",
      description: `Run a diff scan on every new commit, across new and existing ${pluralNoun}.`
    },
    {
      name: "isHistoricalScanEnabled",
      label: "Historical scan",
      description: `Scan newly added ${pluralNoun} for existing secrets as soon as they're enabled.`
    },
    {
      name: "isDiscoveryEnabled",
      label: `Discover new ${pluralNoun}`,
      blocked: !supportsDiscovery,
      description: supportsDiscovery
        ? `Enable scanning for new ${pluralNoun} added to ${platform} automatically.`
        : "GitLab only reports new projects through group webhooks, so discovery needs a group-scoped data source."
    }
  ];

  return (
    <SettingsCard title="Scanning" locked={canEdit ? undefined : RESTRICTED}>
      <Stack gap={16}>
        {items.length > 0 && <DataList variant="props" items={items} />}
        {toggles.map(({ name, label, description, blocked }) => (
          <Switch
            key={name}
            layout="row"
            label={label}
            description={description}
            checked={dataSource[name] && !blocked}
            disabled={!canEdit || blocked || Boolean(pending)}
            onCheckedChange={async (checked) => {
              setPending(name);
              try {
                await update.mutateAsync({
                  dataSourceId: dataSource.id,
                  type: dataSource.type,
                  projectId: dataSource.projectId,
                  [name]: checked
                });
              } catch (error) {
                failed(`Failed to update ${label.toLowerCase()}`, error);
                return;
              } finally {
                setPending(undefined);
              }
              saved(`${label} ${checked ? "turned on" : "turned off"}`);
            }}
          />
        ))}
      </Stack>
    </SettingsCard>
  );
};

export const SettingsTab = ({
  dataSource,
  onDeleted
}: {
  dataSource: TSecretScanningDataSource;
  onDeleted: () => void;
}) => {
  const { permission } = useProjectPermission(dataSource.projectId);
  const can = (action: ProjectPermissionSecretScanningDataSourceActions) =>
    permission.can(action, ProjectPermissionSub.SecretScanningDataSources);
  const canEdit = can(ProjectPermissionSecretScanningDataSourceActions.Edit);
  const canDelete = can(ProjectPermissionSecretScanningDataSourceActions.Delete);
  const deleteDataSource = useV4Adapter("secretScanning").useDeleteDataSource();
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Stack gap={16}>
      <General dataSource={dataSource} canEdit={canEdit} />
      <Scanning dataSource={dataSource} canEdit={canEdit} />
      <SettingsCard
        tone="danger"
        title="Delete data source"
        description={`Stops scanning ${dataSource.name} and permanently deletes its findings and scan history.`}
        action={
          <Button
            variant="destructive"
            disabledReason={canDelete ? undefined : RESTRICTED}
            onClick={() => setDeleting(true)}
          >
            Delete data source
          </Button>
        }
      />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent tone="danger" confirmText={dataSource.name} pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${dataSource.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Its findings and scan history are deleted too. You cannot undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                setPending(true);
                try {
                  await deleteDataSource.mutateAsync({
                    dataSourceId: dataSource.id,
                    type: dataSource.type,
                    projectId: dataSource.projectId
                  });
                } catch (error) {
                  failed("Failed to delete data source", error);
                  return;
                } finally {
                  setPending(false);
                }
                saved(`Deleted ${dataSource.name}`);
                setDeleting(false);
                onDeleted();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
