import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { useDiscardChangesGuard } from "@app/components/v4/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@app/components/v4/ui/alert-dialog";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { MultiStep } from "@app/components/v4/ui/multi-step";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import { RadioGroup, RadioGroupCard } from "@app/components/v4/ui/radio-group";
import { Switch } from "@app/components/v4/ui/switch";
import { Textarea } from "@app/components/v4/ui/textarea";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import { ProjectType } from "@app/hooks/api/projects/types";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2/enums";
import type { TCreateSecretScanningDataSourceDTO } from "@app/hooks/api/secretScanningV2/types";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";
import { slugSchema } from "@app/lib/schemas";

import { useDebounced } from "../../access/org/use-debounced";
import { failed, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { startConnectionRedirect } from "../../data/integrations/connection-redirect";
import { orgHref } from "../../links";
import { useConnectionCreation } from "../../secret-manager/OverviewPage/secrets/flows/connection-creation";

type Draft = {
  type: SecretScanningDataSource;
  connection?: { id: string; name: string };
  workspaceSlug: string;
  group?: { id: number; name: string };
  isHistoricalScanEnabled: boolean;
  isScanNewCommitsEnabled: boolean;
  isDiscoveryEnabled: boolean;
  name: string;
  description: string;
};

type Errors = Partial<Record<"connection" | "workspaceSlug" | "name" | "description", string>>;

const initialDraft = (type: SecretScanningDataSource): Draft => ({
  type,
  workspaceSlug: "",
  isHistoricalScanEnabled: true,
  isScanNewCommitsEnabled: true,
  isDiscoveryEnabled: type !== SecretScanningDataSource.GitLab,
  name: "",
  description: ""
});

const ALL_PROJECTS = "all";
const DRAFT_STORAGE_KEY = "v4-secret-scanning-data-source-draft";

const nameSchema = slugSchema({ field: "Name" });
const descriptionSchema = z.string().trim().max(256, "Cannot exceed 256 characters");

const draftSchema = z
  .object({
    type: z.nativeEnum(SecretScanningDataSource),
    connection: z.object({ id: z.string(), name: z.string() }).optional(),
    workspaceSlug: z.string(),
    group: z.object({ id: z.number(), name: z.string() }).optional(),
    isHistoricalScanEnabled: z.boolean(),
    isScanNewCommitsEnabled: z.boolean(),
    isDiscoveryEnabled: z.boolean(),
    name: z.string(),
    description: z.string()
  })
  .superRefine((draft, ctx) => {
    const fail = (path: keyof Draft, message?: string) =>
      message && ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (!draft.connection) fail("connection", "Select a connection");
    if (draft.type === SecretScanningDataSource.Bitbucket && !draft.workspaceSlug)
      fail("workspaceSlug", "Select a workspace");
    fail("name", nameSchema.safeParse(draft.name).error?.issues[0]?.message);
    fail("description", descriptionSchema.safeParse(draft.description).error?.issues[0]?.message);
  });

const supportsDiscovery = (draft: Draft) =>
  draft.type !== SecretScanningDataSource.GitLab || Boolean(draft.group);

const configOf = (draft: Draft) => {
  if (draft.type === SecretScanningDataSource.Bitbucket)
    return { workspaceSlug: draft.workspaceSlug };
  if (draft.type === SecretScanningDataSource.GitLab)
    return draft.group
      ? { scope: GitLabDataSourceScope.Group, groupId: draft.group.id, groupName: draft.group.name }
      : { scope: GitLabDataSourceScope.Account };
  return {};
};

const ConnectionFields = ({
  orgId,
  projectId,
  draft,
  errors,
  onChange,
  onRedirect
}: {
  orgId: string;
  projectId: string;
  draft: Draft;
  errors: Errors;
  onChange: (changes: Partial<Draft>) => void;
  onRedirect: () => void;
}) => {
  const scanning = useV4Adapter("secretScanning");
  const { data: appOptions } = useV4Adapter("integrations").useConnectionOptions(
    ProjectType.SecretScanning
  );
  const app = SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[draft.type];
  const appName = APP_CONNECTION_MAP[app].name;
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim());
  const connectionId = draft.connection?.id ?? "";
  const { data: available = [], isPending } = scanning.useAvailableConnections(app, projectId);
  const connections =
    draft.connection && !available.some((entry) => entry.id === draft.connection?.id)
      ? [...available, draft.connection]
      : available;
  const creation = useConnectionCreation(
    app,
    projectId,
    (connection) => {
      setSearch("");
      onChange({
        connection: { id: connection.id, name: connection.name },
        workspaceSlug: "",
        group: undefined,
        ...(draft.type === SecretScanningDataSource.GitLab && { isDiscoveryEnabled: false })
      });
    },
    {
      returnTo: orgHref(orgId, "/secret-scanning/data-sources"),
      projectId,
      option: appOptions?.find((entry) => entry.app === app) as Record<string, unknown> | undefined,
      start: (href, pending) => {
        onRedirect();
        startConnectionRedirect(href, pending);
      }
    }
  );
  const workspaces = scanning.useBitbucketWorkspaces(
    draft.type === SecretScanningDataSource.Bitbucket ? connectionId : "",
    debounced || undefined
  );
  const groups = scanning.useGitLabGroups(
    draft.type === SecretScanningDataSource.GitLab ? connectionId : "",
    debounced || undefined
  );
  const groupOptions = [
    { value: ALL_PROJECTS, label: "All accessible projects" },
    ...(draft.group && !groups.data?.some((group) => Number(group.id) === draft.group?.id)
      ? [{ value: String(draft.group.id), label: draft.group.name }]
      : []),
    ...(groups.data ?? []).map((group) => ({ value: group.id, label: group.fullPath }))
  ];

  return (
    <Stack gap={16}>
      <Field label={`${appName} connection`} error={errors.connection} wide>
        <Combobox
          label={`${appName} connection`}
          value={connectionId}
          loading={isPending}
          options={connections.map((connection) => ({
            value: connection.id,
            label: connection.name
          }))}
          placeholder="Select connection..."
          emptyText={`No ${appName} connections yet.`}
          invalid={Boolean(errors.connection)}
          creation={creation}
          onValueChange={(id) => {
            if (id === connectionId) return;
            const connection = connections.find((entry) => entry.id === id);
            if (!connection) return;
            setSearch("");
            onChange({
              connection: { id: connection.id, name: connection.name },
              workspaceSlug: "",
              group: undefined,
              ...(draft.type === SecretScanningDataSource.GitLab && { isDiscoveryEnabled: false })
            });
          }}
        />
      </Field>
      {draft.type === SecretScanningDataSource.Bitbucket && (
        <Field label="Workspace" error={errors.workspaceSlug} wide>
          <Combobox
            label="Workspace"
            value={draft.workspaceSlug}
            loading={Boolean(connectionId) && workspaces.isPending}
            disabled={!connectionId}
            options={(workspaces.data ?? []).map(({ slug }) => ({ value: slug, label: slug }))}
            onSearch={setSearch}
            placeholder="Select a workspace..."
            emptyText="No workspaces found."
            invalid={Boolean(errors.workspaceSlug)}
            onValueChange={(workspaceSlug) => onChange({ workspaceSlug })}
          />
        </Field>
      )}
      {draft.type === SecretScanningDataSource.GitLab && (
        <Field
          label="Group"
          optional
          description="Leave empty to cover every project the connection can read. Select a group to also discover projects added to it later."
          wide
        >
          <Combobox
            label="Group"
            value={draft.group ? String(draft.group.id) : ALL_PROJECTS}
            loading={Boolean(connectionId) && groups.isPending}
            disabled={!connectionId}
            options={groupOptions}
            onSearch={setSearch}
            placeholder="All accessible projects"
            emptyText="No groups found."
            onValueChange={(value) => {
              const group =
                value === ALL_PROJECTS
                  ? undefined
                  : groupOptions.find((option) => option.value === value);
              onChange({
                group: group && { id: Number(group.value), name: group.label },
                isDiscoveryEnabled: Boolean(group)
              });
            }}
          />
        </Field>
      )}
    </Stack>
  );
};

export const AddDataSourceSheet = ({
  orgId,
  projectId,
  open,
  onOpenChange
}: {
  orgId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const scanning = useV4Adapter("secretScanning");
  const navigate = useNavigate();
  const { connectionId, connectionName } = useSearch({ strict: false }) as {
    connectionId?: string;
    connectionName?: string;
  };
  const { data: options, isPending: optionsPending } = scanning.useDataSourceOptions();
  const create = scanning.useCreateDataSource();
  const {
    watch,
    setValue,
    trigger,
    clearErrors,
    reset,
    formState: { errors, isDirty }
  } = useForm<Draft>({
    resolver: zodResolver(draftSchema),
    defaultValues: initialDraft(SecretScanningDataSource.GitHub)
  });
  const draft = watch();
  const [step, setStep] = useState(0);
  const completed = useRef(false);
  const fieldErrors: Errors = {
    connection: errors.connection?.message,
    workspaceSlug: errors.workspaceSlug?.message,
    name: errors.name?.message,
    description: errors.description?.message
  };

  const { name: platform } = SECRET_SCANNING_DATA_SOURCE_MAP[draft.type];
  const resource = RESOURCE_DESCRIPTION_HELPER[draft.type];
  const discovery = supportsDiscovery(draft);

  const change = (changes: Partial<Draft>) => {
    (Object.keys(changes) as (keyof Draft)[]).forEach((key) =>
      setValue(key, changes[key] as never, { shouldDirty: true })
    );
    clearErrors(Object.keys(changes) as (keyof Draft)[]);
  };

  const close = () => {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    reset(initialDraft(SecretScanningDataSource.GitHub));
    setStep(0);
    onOpenChange(false);
  };

  useEffect(() => {
    if (!connectionId || !connectionName) return;
    const stored = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    navigate({ to: ".", search: {}, replace: true });
    if (!stored) return;
    let saved: Draft;
    try {
      saved = JSON.parse(stored) as Draft;
    } catch {
      return;
    }
    reset(initialDraft(saved.type));
    change({
      ...saved,
      connection: { id: connectionId, name: connectionName },
      workspaceSlug: "",
      group: undefined,
      isDiscoveryEnabled: saved.type !== SecretScanningDataSource.GitLab
    });
    setStep(1);
    onOpenChange(true);
  }, [connectionId, connectionName]);

  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty,
    onDiscard: close
  });

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title="Add data source"
        open={open}
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next) {
            onOpenChange(true);
            return;
          }
          if (completed.current) {
            completed.current = false;
            close();
            return;
          }
          requestDiscard();
        }}
        completeLabel="Add data source"
        onComplete={async () => {
          try {
            await create.mutateAsync({
              type: draft.type,
              projectId,
              name: draft.name.trim(),
              description: draft.description.trim() || null,
              connectionId: draft.connection?.id,
              config: configOf(draft),
              isHistoricalScanEnabled: draft.isHistoricalScanEnabled,
              isScanNewCommitsEnabled: draft.isScanNewCommitsEnabled,
              isDiscoveryEnabled: draft.isDiscoveryEnabled && discovery
            } as TCreateSecretScanningDataSourceDTO);
          } catch (error) {
            failed("Failed to add data source", error);
            throw error;
          }
          toast({ tone: "ok", title: `Added ${platform} data source ${draft.name.trim()}` });
          completed.current = true;
        }}
        steps={[
          {
            title: "Platform",
            summary: platform,
            content: optionsPending ? (
              <Loader label="Loading platforms" />
            ) : (
              <RadioGroup
                aria-label="Platform"
                value={draft.type}
                onValueChange={(value) => {
                  const type = value as SecretScanningDataSource;
                  if (type === draft.type) return;
                  const defaults = initialDraft(type);
                  change({
                    type,
                    connection: undefined,
                    workspaceSlug: defaults.workspaceSlug,
                    group: undefined,
                    isHistoricalScanEnabled: defaults.isHistoricalScanEnabled,
                    isScanNewCommitsEnabled: defaults.isScanNewCommitsEnabled,
                    isDiscoveryEnabled: defaults.isDiscoveryEnabled
                  });
                }}
              >
                {options?.map(({ type }) => {
                  const { name, image } = SECRET_SCANNING_DATA_SOURCE_MAP[type];
                  return (
                    <RadioGroupCard
                      key={type}
                      value={type}
                      title={name}
                      description={`Scan ${RESOURCE_DESCRIPTION_HELPER[type].pluralNoun} on ${name}.`}
                      media={<ProviderIcon icon={image} alt="" size="sm" />}
                    />
                  );
                })}
              </RadioGroup>
            )
          },
          {
            title: "Connection",
            summary: draft.connection?.name,
            description:
              "The connection and scope can't be changed after the data source is added.",
            validate: () => trigger(["connection", "workspaceSlug"]),
            content: (
              <ConnectionFields
                orgId={orgId}
                projectId={projectId}
                draft={draft}
                errors={fieldErrors}
                onChange={change}
                onRedirect={() => sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))}
              />
            )
          },
          {
            title: "Scanning",
            content: (
              <Stack gap={16}>
                <Switch
                  layout="row"
                  label="Historical scan"
                  description={`Scan existing history when ${resource.pluralNoun} are added.`}
                  checked={draft.isHistoricalScanEnabled}
                  onCheckedChange={(isHistoricalScanEnabled) => change({ isHistoricalScanEnabled })}
                />
                <Switch
                  layout="row"
                  label="Auto-scan"
                  description={`Scan ${resource.pluralNoun} when a ${resource.verb} occurs.`}
                  checked={draft.isScanNewCommitsEnabled}
                  onCheckedChange={(isScanNewCommitsEnabled) => change({ isScanNewCommitsEnabled })}
                />
                <Switch
                  layout="row"
                  label={`Discover new ${resource.pluralNoun}`}
                  description={`Add every ${resource.singularNoun} the connection can access, including ones created later.`}
                  checked={draft.isDiscoveryEnabled && discovery}
                  disabledReason={
                    discovery
                      ? undefined
                      : "Select a group to enable this. GitLab only reports new projects through group webhooks."
                  }
                  onCheckedChange={(isDiscoveryEnabled) => change({ isDiscoveryEnabled })}
                />
              </Stack>
            )
          },
          {
            title: "Details",
            summary: draft.name || undefined,
            validate: () => trigger(["name", "description"]),
            content: (
              <Stack gap={16}>
                <Field
                  label="Name"
                  description="Lowercase letters, numbers and dashes."
                  error={fieldErrors.name}
                  wide
                >
                  <Input
                    value={draft.name}
                    invalid={Boolean(fieldErrors.name)}
                    placeholder="acme-corp"
                    autoComplete="off"
                    onChange={(event) => change({ name: event.target.value })}
                  />
                </Field>
                <Field label="Description" optional error={fieldErrors.description} wide>
                  <Textarea
                    rows={3}
                    value={draft.description}
                    aria-invalid={Boolean(fieldErrors.description) || undefined}
                    onChange={(event) => change({ description: event.target.value })}
                  />
                </Field>
              </Stack>
            )
          },
          {
            title: "Review",
            content: (
              <DataList
                variant="props"
                items={[
                  ["Platform", platform],
                  ["Connection", draft.connection?.name ?? "-"],
                  ...(draft.type === SecretScanningDataSource.Bitbucket
                    ? ([["Workspace", draft.workspaceSlug]] as const)
                    : []),
                  ...(draft.type === SecretScanningDataSource.GitLab
                    ? ([["Group", draft.group?.name ?? "All accessible projects"]] as const)
                    : []),
                  ["Historical scan", draft.isHistoricalScanEnabled ? "On" : "Off"],
                  ["Auto-scan", draft.isScanNewCommitsEnabled ? "On" : "Off"],
                  [
                    `Discover new ${resource.pluralNoun}`,
                    draft.isDiscoveryEnabled && discovery ? "On" : "Off"
                  ],
                  ["Name", draft.name],
                  ...(draft.description.trim()
                    ? ([["Description", draft.description.trim()]] as const)
                    : [])
                ]}
              />
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your data source setup will be lost."
      />
    </>
  );
};
