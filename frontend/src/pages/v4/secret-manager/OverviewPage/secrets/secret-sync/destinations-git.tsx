import { useState } from "react";
import { Controller, type FieldValues, useWatch } from "react-hook-form";
import { Combobox, type ComboboxOption } from "@infisical/cipher/ui/combobox";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import axios, { HttpStatusCode } from "axios";

import { useDebounce } from "@app/hooks";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { GitLabSyncScope } from "@app/hooks/api/secretSyncs/types/gitlab-sync";

import { useV4Adapter } from "../../../../data/adapters";
import {
  ComboField,
  ConnectionField,
  labelFor,
  type ReviewItems,
  SyncField,
  type SyncView,
  TextField,
  useConnectionId,
  useConnectionOptions,
  useSyncForm,
  yesNo
} from "./sync-fields";

const GITLAB_LIST_LIMIT = 20;
const GITLAB_SEARCH_DEBOUNCE_MS = 500;
const BITBUCKET_SEARCH_DEBOUNCE_MS = 300;
const NONE_OPTION: ComboboxOption = { value: "", label: "None" };

const GITLAB_SCOPES = [
  { value: GitLabSyncScope.Project, label: "Project" },
  { value: GitLabSyncScope.Group, label: "Group" }
];

const GITLAB_RESULTS_TIP = "Only the first results are shown. Search by name to find more.";

const isSearchPending = (search: string, debounced: string) =>
  search.trim().toLowerCase() !== debounced.trim().toLowerCase();

const searchEmptyText = (error: unknown, search: string, resource: "groups" | "projects") => {
  if (error)
    return axios.isAxiosError(error) && error.response?.status === HttpStatusCode.TooManyRequests
      ? `GitLab is rate limiting ${resource}. Wait a moment and try again.`
      : `Unable to load GitLab ${resource}. Try again.`;
  return search ? `No ${resource} found matching your search.` : `No ${resource} found.`;
};

function SearchComboField({
  name,
  label,
  tooltip,
  options,
  fallback,
  placeholder,
  emptyText,
  loading,
  disabled,
  onSearch,
  onSelect
}: {
  name: string;
  label: string;
  tooltip?: string;
  options: ComboboxOption[];
  fallback?: ComboboxOption;
  placeholder: string;
  emptyText: string;
  loading: boolean;
  disabled?: boolean;
  onSearch: (query: string) => void;
  onSelect: (value: string) => void;
}) {
  const { control } = useSyncForm();
  const connectionId = useConnectionId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <SyncField label={label} tooltip={tooltip} error={error?.message}>
          <Combobox
            label={label}
            value={field.value ?? ""}
            onValueChange={(value) => {
              if (value === field.value) return;
              field.onChange(value);
              onSelect(value);
            }}
            options={
              fallback &&
              fallback.value === field.value &&
              !options.some((o) => o.value === fallback.value)
                ? [fallback, ...options]
                : options
            }
            placeholder={placeholder}
            emptyText={emptyText}
            loading={loading}
            onSearch={onSearch}
            disabled={disabled || !connectionId}
            invalid={Boolean(error)}
          />
        </SyncField>
      )}
    />
  );
}

function GitLabSwitch({
  name,
  label,
  description,
  disabledReason,
  onChange
}: {
  name: string;
  label: string;
  description: string;
  disabledReason?: string;
  onChange?: (checked: boolean) => void;
}) {
  const { control } = useSyncForm();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Switch
          ref={field.ref}
          layout="row"
          label={label}
          description={description}
          disabledReason={disabledReason}
          checked={Boolean(field.value)}
          onCheckedChange={(checked) => {
            field.onChange(checked);
            onChange?.(checked);
          }}
        />
      )}
    />
  );
}

function GitLabDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, scope, projectId, projectName, groupId, groupName, shouldMask] = useWatch({
    control,
    name: [
      "connection.id",
      "destinationConfig.scope",
      "destinationConfig.projectId",
      "destinationConfig.projectName",
      "destinationConfig.groupId",
      "destinationConfig.groupName",
      "destinationConfig.shouldMaskSecrets"
    ]
  }) as [
    string | undefined,
    GitLabSyncScope,
    string | undefined,
    string | undefined,
    string | undefined,
    string | undefined,
    boolean | undefined
  ];
  const [projectSearch, setProjectSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [debouncedProjectSearch] = useDebounce(projectSearch, GITLAB_SEARCH_DEBOUNCE_MS);
  const [debouncedGroupSearch] = useDebounce(groupSearch, GITLAB_SEARCH_DEBOUNCE_MS);
  const adapter = useV4Adapter("secrets");
  const projectsEnabled = Boolean(connectionId) && scope === GitLabSyncScope.Project;
  const groupsEnabled = Boolean(connectionId) && scope === GitLabSyncScope.Group;
  const projects = adapter.useGitLabProjects(
    {
      connectionId: connectionId ?? "",
      search: debouncedProjectSearch || undefined,
      limit: GITLAB_LIST_LIMIT
    },
    { enabled: projectsEnabled }
  );
  const groups = adapter.useGitLabGroups(
    {
      connectionId: connectionId ?? "",
      search: debouncedGroupSearch || undefined,
      limit: GITLAB_LIST_LIMIT
    },
    { enabled: groupsEnabled }
  );
  const resetTargets = () => {
    setValue("destinationConfig.projectId", "");
    setValue("destinationConfig.projectName", "");
    setValue("destinationConfig.groupId", "");
    setValue("destinationConfig.groupName", "");
    setProjectSearch("");
    setGroupSearch("");
  };
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          resetTargets();
          setValue("destinationConfig.scope", GitLabSyncScope.Project);
        }}
      />
      <SyncField label="Scope">
        <Controller
          control={control}
          name="destinationConfig.scope"
          render={({ field }) => (
            <Select
              value={field.value ?? ""}
              onValueChange={(value) => {
                field.onChange(value);
                resetTargets();
              }}
              options={GITLAB_SCOPES}
              placeholder="Select a scope..."
            />
          )}
        />
      </SyncField>
      {scope === GitLabSyncScope.Group && (
        <SearchComboField
          name="destinationConfig.groupId"
          label="Group"
          tooltip={GITLAB_RESULTS_TIP}
          options={(groups.data ?? []).map((group) => ({
            value: group.id,
            label: group.fullPath
          }))}
          fallback={
            groupId && !groupSearch && !groups.error
              ? { value: groupId, label: groupName || groupId }
              : undefined
          }
          placeholder="Select a group..."
          emptyText={searchEmptyText(groups.error, groupSearch, "groups")}
          loading={
            groupsEnabled &&
            (groups.isPending || isSearchPending(groupSearch, debouncedGroupSearch))
          }
          onSearch={setGroupSearch}
          onSelect={(value) =>
            setValue(
              "destinationConfig.groupName",
              groups.data?.find((group) => group.id === value)?.fullName ?? "",
              { shouldDirty: true }
            )
          }
        />
      )}
      {scope === GitLabSyncScope.Project && (
        <SearchComboField
          name="destinationConfig.projectId"
          label="GitLab project"
          tooltip={GITLAB_RESULTS_TIP}
          options={(projects.data ?? []).map((project) => ({
            value: project.id,
            label: project.name
          }))}
          fallback={
            projectId && !projectSearch && !projects.error
              ? { value: projectId, label: projectName || projectId }
              : undefined
          }
          placeholder="Select a project..."
          emptyText={searchEmptyText(projects.error, projectSearch, "projects")}
          loading={
            projectsEnabled &&
            (projects.isPending || isSearchPending(projectSearch, debouncedProjectSearch))
          }
          onSearch={setProjectSearch}
          onSelect={(value) =>
            setValue(
              "destinationConfig.projectName",
              projects.data?.find((project) => project.id === value)?.name ?? "",
              { shouldDirty: true }
            )
          }
        />
      )}
      <TextField
        name="destinationConfig.targetEnvironment"
        label="GitLab environment scope"
        placeholder="*"
        optional
      />
      <GitLabSwitch
        name="destinationConfig.shouldProtectSecrets"
        label="Mark secrets as protected"
        description="Only exposed to pipelines on protected branches and tags."
      />
      <GitLabSwitch
        name="destinationConfig.shouldMaskSecrets"
        label="Mark secrets as masked"
        description="Hidden in job logs. Values must be at least 8 characters and meet GitLab's masking requirements."
        onChange={(checked) => {
          if (!checked) setValue("destinationConfig.shouldHideSecrets", false);
        }}
      />
      <GitLabSwitch
        name="destinationConfig.shouldHideSecrets"
        label="Mark secrets as hidden"
        description="Hides the value in the GitLab UI. Once enabled, Infisical can't unhide or unmask it."
        disabledReason={shouldMask ? undefined : "Turn on masking first."}
      />
    </Stack>
  );
}

function BitbucketDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, workspace, repository] = useWatch({
    control,
    name: ["connection.id", "destinationConfig.workspaceSlug", "destinationConfig.repositorySlug"]
  }) as [string | undefined, string | undefined, string | undefined];
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [repoSearch, setRepoSearch] = useState("");
  const [debouncedWorkspaceSearch] = useDebounce(workspaceSearch, BITBUCKET_SEARCH_DEBOUNCE_MS);
  const [debouncedRepoSearch] = useDebounce(repoSearch, BITBUCKET_SEARCH_DEBOUNCE_MS);
  const adapter = useV4Adapter("secrets");
  const workspaces = adapter.useBitbucketWorkspaces(
    { connectionId: connectionId ?? "", search: debouncedWorkspaceSearch || undefined },
    { enabled: Boolean(connectionId) }
  );
  const repositories = adapter.useBitbucketRepositories(
    {
      connectionId: connectionId ?? "",
      workspaceSlug: workspace ?? "",
      search: debouncedRepoSearch || undefined
    },
    { enabled: Boolean(connectionId && workspace) }
  );
  const environments = adapter.useBitbucketEnvironments(
    {
      connectionId: connectionId ?? "",
      workspaceSlug: workspace ?? "",
      repositorySlug: repository ?? ""
    },
    { enabled: Boolean(connectionId && workspace && repository) }
  );
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.workspaceSlug", "");
          setValue("destinationConfig.repositorySlug", "");
          setValue("destinationConfig.environmentId", "");
          setWorkspaceSearch("");
          setRepoSearch("");
        }}
      />
      <SearchComboField
        name="destinationConfig.workspaceSlug"
        label="Workspace"
        options={(workspaces.data ?? []).map((entry) => ({ value: entry.slug, label: entry.slug }))}
        fallback={
          workspace && !workspaceSearch ? { value: workspace, label: workspace } : undefined
        }
        placeholder="Select a workspace..."
        emptyText={
          workspaceSearch ? "No workspaces found matching your search." : "No workspaces found."
        }
        loading={
          Boolean(connectionId) &&
          (workspaces.isPending || isSearchPending(workspaceSearch, debouncedWorkspaceSearch))
        }
        onSearch={setWorkspaceSearch}
        onSelect={() => {
          setValue("destinationConfig.repositorySlug", "");
          setValue("destinationConfig.environmentId", "");
          setRepoSearch("");
        }}
      />
      <SearchComboField
        name="destinationConfig.repositorySlug"
        label="Repository"
        options={(repositories.data ?? []).map((entry) => ({
          value: entry.slug,
          label: entry.full_name
        }))}
        fallback={
          repository && !repoSearch
            ? { value: repository, label: `${workspace}/${repository}` }
            : undefined
        }
        placeholder="Select a repository..."
        emptyText={
          repoSearch ? "No repositories found matching your search." : "No repositories found."
        }
        loading={
          Boolean(connectionId && workspace) &&
          (repositories.isPending || isSearchPending(repoSearch, debouncedRepoSearch))
        }
        disabled={!workspace}
        onSearch={setRepoSearch}
        onSelect={() => setValue("destinationConfig.environmentId", "")}
      />
      <ComboField
        name="destinationConfig.environmentId"
        label="Deployment environment"
        optional
        options={[
          NONE_OPTION,
          ...(environments.data ?? []).map((entry) => ({ value: entry.uuid, label: entry.name }))
        ]}
        placeholder="Select an environment..."
        disabled={!repository}
      />
    </Stack>
  );
}

function CircleCIDestination() {
  const { control, setValue } = useSyncForm();
  const orgName = useWatch({ control, name: "destinationConfig.orgName" }) as string | undefined;
  const adapter = useV4Adapter("secrets");
  const organizations = useConnectionOptions(adapter.useCircleCIOrganizations);
  const projects = organizations.find((org) => org.name === orgName)?.projects ?? [];
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.orgName", "");
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
        }}
      />
      <ComboField
        name="destinationConfig.orgName"
        label="Organization"
        options={organizations.map((org) => ({ value: org.name, label: org.name }))}
        placeholder="Select an organization..."
        onSelect={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
        }}
      />
      <ComboField
        name="destinationConfig.projectId"
        label="Project"
        options={projects.map((project) => ({
          value: project.id,
          label: project.name,
          meta: project.id
        }))}
        placeholder="Select a project..."
        emptyText="No projects found. Create a project in the selected organization first."
        disabled={!orgName}
        onSelect={(value) =>
          setValue(
            "destinationConfig.projectName",
            projects.find((project) => project.id === value)?.name ?? ""
          )
        }
      />
    </Stack>
  );
}

function TravisCIDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, repositoryId] = useWatch({
    control,
    name: ["connection.id", "destinationConfig.repositoryId"]
  }) as [string | undefined, string | undefined];
  const adapter = useV4Adapter("secrets");
  const repositories = useConnectionOptions(adapter.useTravisCIRepositories);
  const branches =
    adapter.useTravisCIBranches(
      { connectionId: connectionId ?? "", repositoryId: repositoryId ?? "" },
      { enabled: Boolean(connectionId && repositoryId) }
    ).data ?? [];
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.repositoryId", "");
          setValue("destinationConfig.repositorySlug", "");
          setValue("destinationConfig.branch", "");
        }}
      />
      <ComboField
        name="destinationConfig.repositoryId"
        label="Repository"
        options={repositories.map((repo) => ({ value: repo.id, label: repo.slug }))}
        placeholder="Select a repository..."
        onSelect={(value) => {
          setValue(
            "destinationConfig.repositorySlug",
            repositories.find((repo) => repo.id === value)?.slug ?? ""
          );
          setValue("destinationConfig.branch", "");
        }}
      />
      <ComboField
        name="destinationConfig.branch"
        label="Branch"
        optional
        options={[
          NONE_OPTION,
          ...branches.map((branch) => ({
            value: branch.name,
            label: branch.isDefault ? `${branch.name} (default)` : branch.name
          }))
        ]}
        placeholder="Select a branch..."
        disabled={!repositoryId}
      />
    </Stack>
  );
}

function TeamCityDestination() {
  const { control, setValue } = useSyncForm();
  const project = useWatch({ control, name: "destinationConfig.project" }) as string | undefined;
  const adapter = useV4Adapter("secrets");
  const projects = useConnectionOptions(adapter.useTeamCityProjects);
  const buildTypes = projects.find((entry) => entry.id === project)?.buildTypes?.buildType ?? [];
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.project", "");
          setValue("destinationConfig.buildConfig", "");
        }}
      />
      <ComboField
        name="destinationConfig.project"
        label="Project"
        options={projects.map((entry) => ({ value: entry.id, label: entry.name, meta: entry.id }))}
        placeholder="Select a project..."
        onSelect={() => setValue("destinationConfig.buildConfig", "")}
      />
      <ComboField
        name="destinationConfig.buildConfig"
        label="Build configuration"
        optional
        tooltip='The access token needs the "View build configuration settings" permission.'
        description="Leave empty to sync secrets to the whole project."
        options={[
          NONE_OPTION,
          ...buildTypes.map((buildType) => ({
            value: buildType.id,
            label: buildType.name,
            meta: buildType.id
          }))
        ]}
        placeholder="Select a build configuration..."
        disabled={!project}
      />
    </Stack>
  );
}

function BitbucketEnvironmentName({ config }: { config: FieldValues }) {
  const connectionId = useConnectionId();
  const environments = useV4Adapter("secrets").useBitbucketEnvironments(
    {
      connectionId: connectionId ?? "",
      workspaceSlug: config.workspaceSlug,
      repositorySlug: config.repositorySlug
    },
    { enabled: Boolean(connectionId) }
  ).data;
  return (
    environments?.find((entry) => entry.uuid === config.environmentId)?.name ?? config.environmentId
  );
}

function TeamCityNames({
  config,
  field
}: {
  config: FieldValues;
  field: "project" | "buildConfig";
}) {
  const projects = useConnectionOptions(useV4Adapter("secrets").useTeamCityProjects);
  const project = projects.find((entry) => entry.id === config.project);
  if (field === "project") return project?.name ?? config.project;
  return (
    project?.buildTypes?.buildType?.find((entry) => entry.id === config.buildConfig)?.name ??
    config.buildConfig
  );
}

const gitlabReview = (config: FieldValues): ReviewItems => [
  ...(config.scope === GitLabSyncScope.Group
    ? [["Group name", config.groupName] as const, ["Group ID", config.groupId] as const]
    : [["Project name", config.projectName] as const, ["Project ID", config.projectId] as const]),
  ...(config.targetEnvironment ? [["Environment scope", config.targetEnvironment] as const] : []),
  ["Protect secrets", yesNo(config.shouldProtectSecrets)],
  ["Mask secrets", yesNo(config.shouldMaskSecrets)],
  ["Hide secrets", yesNo(config.shouldHideSecrets)]
];

export const GIT_SYNC_VIEWS: Record<
  | SecretSync.GitLab
  | SecretSync.Bitbucket
  | SecretSync.CircleCI
  | SecretSync.TravisCI
  | SecretSync.TeamCity,
  SyncView
> = {
  [SecretSync.GitLab]: {
    Destination: GitLabDestination,
    defaults: {
      destinationConfig: {
        scope: GitLabSyncScope.Project,
        projectId: "",
        projectName: "",
        targetEnvironment: "",
        shouldProtectSecrets: false,
        shouldMaskSecrets: false,
        shouldHideSecrets: false
      }
    },
    destinationReview: (config) => [
      ["Scope", labelFor(GITLAB_SCOPES, config.scope)],
      ...gitlabReview(config)
    ]
  },
  [SecretSync.Bitbucket]: {
    Destination: BitbucketDestination,
    defaults: {
      destinationConfig: { workspaceSlug: "", repositorySlug: "", environmentId: "" }
    },
    destinationReview: (config) => [
      ["Workspace", config.workspaceSlug],
      ["Repository", config.repositorySlug],
      ...(config.environmentId
        ? [["Deployment environment", <BitbucketEnvironmentName config={config} />] as const]
        : [])
    ]
  },
  [SecretSync.CircleCI]: {
    Destination: CircleCIDestination,
    defaults: { destinationConfig: { orgName: "", projectId: "", projectName: "" } },
    destinationReview: (config) => [
      ["Organization", config.orgName],
      ["Project", config.projectName]
    ]
  },
  [SecretSync.TravisCI]: {
    Destination: TravisCIDestination,
    defaults: { destinationConfig: { repositoryId: "", repositorySlug: "", branch: "" } },
    destinationReview: (config) => [
      ["Repository", config.repositorySlug],
      ...(config.branch ? [["Branch", config.branch] as const] : [])
    ]
  },
  [SecretSync.TeamCity]: {
    Destination: TeamCityDestination,
    defaults: { destinationConfig: { project: "", buildConfig: "" } },
    destinationReview: (config) => [
      ["Project", <TeamCityNames config={config} field="project" />],
      ...(config.buildConfig
        ? [["Build configuration", <TeamCityNames config={config} field="buildConfig" />] as const]
        : [])
    ]
  }
};
