import { useRef, useState } from "react";
import { z } from "zod";

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
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2/enums";
import type { TCreateSecretScanningDataSourceDTO } from "@app/hooks/api/secretScanningV2/types";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";
import { slugSchema } from "@app/lib/schemas";

import { useDebounced } from "../../access/org/use-debounced";
import { failed, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { orgHref } from "../../links";

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

const nameSchema = slugSchema({ field: "Name" });
const descriptionSchema = z.string().trim().max(256, "Cannot exceed 256 characters");

const issue = (schema: z.ZodTypeAny, value: unknown) =>
  schema.safeParse(value).error?.issues[0]?.message;

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
  onChange
}: {
  orgId: string;
  projectId: string;
  draft: Draft;
  errors: Errors;
  onChange: (changes: Partial<Draft>) => void;
}) => {
  const scanning = useV4Adapter("secretScanning");
  const app = SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[draft.type];
  const appName = APP_CONNECTION_MAP[app].name;
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim());
  const connectionId = draft.connection?.id ?? "";
  const { data: connections = [], isPending } = scanning.useAvailableConnections(app, projectId);
  const workspaces = scanning.useBitbucketWorkspaces(
    draft.type === SecretScanningDataSource.Bitbucket ? connectionId : "",
    debounced || undefined
  );
  const groups = scanning.useGitLabGroups(
    draft.type === SecretScanningDataSource.GitLab ? connectionId : "",
    debounced || undefined
  );
  const groupOptions = [
    ...(draft.group && !groups.data?.some((group) => Number(group.id) === draft.group?.id)
      ? [{ value: String(draft.group.id), label: draft.group.name }]
      : []),
    ...(groups.data ?? []).map((group) => ({ value: group.id, label: group.fullPath }))
  ];

  return (
    <Stack gap={16}>
      <Field
        label={`${appName} connection`}
        error={errors.connection}
        description={
          <>
            Manage connections in{" "}
            <a href={orgHref(orgId, "/secret-scanning/app-connections")}>App connections</a>.
          </>
        }
        wide
      >
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
          onValueChange={(id) => {
            if (id === connectionId) return;
            const connection = connections.find((entry) => entry.id === id);
            setSearch("");
            onChange({
              connection: connection && { id: connection.id, name: connection.name },
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
            value={draft.group ? String(draft.group.id) : ""}
            loading={Boolean(connectionId) && groups.isPending}
            disabled={!connectionId}
            options={groupOptions}
            onSearch={setSearch}
            placeholder="All accessible projects"
            emptyText="No groups found."
            onValueChange={(value) => {
              const group = groupOptions.find((option) => option.value === value);
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
  const { data: options, isPending: optionsPending } = scanning.useDataSourceOptions();
  const create = scanning.useCreateDataSource();
  const [draft, setDraft] = useState(() => initialDraft(SecretScanningDataSource.GitHub));
  const [errors, setErrors] = useState<Errors>({});
  const [step, setStep] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const completed = useRef(false);

  const { name: platform } = SECRET_SCANNING_DATA_SOURCE_MAP[draft.type];
  const resource = RESOURCE_DESCRIPTION_HELPER[draft.type];
  const discovery = supportsDiscovery(draft);
  const dirty = step > 0 || Boolean(draft.name || draft.description);

  const change = (changes: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setErrors((current) => {
      const next = { ...current };
      (Object.keys(changes) as (keyof Errors)[]).forEach((key) => {
        next[key] = undefined;
      });
      return next;
    });
  };

  const check = (next: Errors) => {
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const close = () => {
    setDraft(initialDraft(SecretScanningDataSource.GitHub));
    setErrors({});
    setStep(0);
    onOpenChange(false);
  };

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
          if (dirty) {
            setStep(step);
            setDiscarding(true);
            return;
          }
          close();
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
                  if (type !== draft.type)
                    setDraft({
                      ...initialDraft(type),
                      name: draft.name,
                      description: draft.description
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
            validate: () =>
              check({
                connection: draft.connection ? undefined : "Select a connection",
                workspaceSlug:
                  draft.type === SecretScanningDataSource.Bitbucket && !draft.workspaceSlug
                    ? "Select a workspace"
                    : undefined
              }),
            content: (
              <ConnectionFields
                orgId={orgId}
                projectId={projectId}
                draft={draft}
                errors={errors}
                onChange={change}
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
            validate: () =>
              check({
                name: issue(nameSchema, draft.name),
                description: issue(descriptionSchema, draft.description)
              }),
            content: (
              <Stack gap={16}>
                <Field
                  label="Name"
                  description="Lowercase letters, numbers and dashes."
                  error={errors.name}
                  wide
                >
                  <Input
                    value={draft.name}
                    invalid={Boolean(errors.name)}
                    placeholder="acme-corp"
                    autoComplete="off"
                    onChange={(event) => change({ name: event.target.value })}
                  />
                </Field>
                <Field label="Description" optional error={errors.description} wide>
                  <Textarea
                    rows={3}
                    value={draft.description}
                    aria-invalid={Boolean(errors.description) || undefined}
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
        open={discarding}
        onOpenChange={setDiscarding}
        onDiscard={() => {
          setDiscarding(false);
          close();
        }}
        description="Your data source setup will be lost."
      />
    </>
  );
};
