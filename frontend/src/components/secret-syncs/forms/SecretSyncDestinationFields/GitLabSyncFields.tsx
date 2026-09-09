import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import axios, { HttpStatusCode } from "axios";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import {
  TGitLabGroup,
  TGitLabProject,
  useGitLabConnectionListGroups,
  useGitLabConnectionListProjects
} from "@app/hooks/api/appConnections/gitlab";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GitLabSyncScope } from "@app/hooks/api/secretSyncs/types/gitlab-sync";

import { TSecretSyncForm } from "../schemas";

const GITLAB_SYNC_LIST_LIMIT = 20;
const GITLAB_SEARCH_DEBOUNCE_MS = 500;

const normalizeGitLabSearch = (value: string) => value.trim().toLocaleLowerCase();

const getGitLabSearchErrorMessage = (error: unknown, resource: "groups" | "projects") => {
  if (!error) return null;

  return axios.isAxiosError(error) && error.response?.status === HttpStatusCode.TooManyRequests
    ? `GitLab is rate limiting ${resource}. Wait a moment and try again.`
    : `Unable to load GitLab ${resource}. Try again.`;
};

const renderGitLabGroupOption = (group: TGitLabGroup) => (
  <div className="min-w-0">
    <p className="truncate">{group.name}</p>
    {group.fullPath !== group.name && (
      <p className="truncate text-xs leading-4 text-muted">{group.fullPath}</p>
    )}
  </div>
);

const renderGitLabProjectOption = (project: TGitLabProject) => {
  const fullPathWithNamespace = project.name;
  const shortName = fullPathWithNamespace.split("/").pop() || fullPathWithNamespace;

  return (
    <div className="min-w-0">
      <p className="truncate">{shortName}</p>
      {fullPathWithNamespace !== shortName && (
        <p className="truncate text-xs leading-4 text-muted">{fullPathWithNamespace}</p>
      )}
    </div>
  );
};

const SecretProtectionOption = ({
  title,
  description,
  isEnabled,
  onChange,
  id,
  isDisabled = false
}: {
  title: string;
  description: string;
  isEnabled: boolean;
  onChange: (checked: boolean) => void;
  id: string;
  isDisabled?: boolean;
}) => {
  return (
    <Field orientation="horizontal">
      <FieldContent className={isDisabled ? "pointer-events-none opacity-50" : undefined}>
        <Label htmlFor={id}>{title}</Label>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Toggle
        id={id}
        variant="project"
        checked={isEnabled}
        onCheckedChange={onChange}
        disabled={isDisabled}
      />
    </Field>
  );
};

export const GitLabSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.GitLab }
  >();

  const [projectSearch, setProjectSearch] = useState("");
  const [debouncedProjectSearch] = useDebounce(projectSearch, GITLAB_SEARCH_DEBOUNCE_MS);
  const [groupSearch, setGroupSearch] = useState("");
  const [debouncedGroupSearch] = useDebounce(groupSearch, GITLAB_SEARCH_DEBOUNCE_MS);

  const connectionId = useWatch({ name: "connection.id", control });
  const scope = useWatch({ name: "destinationConfig.scope", control });
  const shouldMaskSecrets = useWatch({ name: "destinationConfig.shouldMaskSecrets", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });
  const projectName = useWatch({ name: "destinationConfig.projectName", control });
  const groupId = useWatch({ name: "destinationConfig.groupId", control });
  const groupName = useWatch({ name: "destinationConfig.groupName", control });

  const {
    data: groups,
    error: groupsError,
    isFetching: isGroupsFetching
  } = useGitLabConnectionListGroups(
    connectionId,
    debouncedGroupSearch || undefined,
    GITLAB_SYNC_LIST_LIMIT,
    {
      enabled: Boolean(connectionId) && scope === GitLabSyncScope.Group
    }
  );

  const {
    data: projects,
    error: projectsError,
    isFetching: isProjectsFetching
  } = useGitLabConnectionListProjects(
    connectionId,
    debouncedProjectSearch || undefined,
    GITLAB_SYNC_LIST_LIMIT,
    {
      enabled: Boolean(connectionId) && scope === GitLabSyncScope.Project
    }
  );

  const isGroupSearchPending =
    Boolean(connectionId) &&
    scope === GitLabSyncScope.Group &&
    (normalizeGitLabSearch(groupSearch) !== normalizeGitLabSearch(debouncedGroupSearch) ||
      isGroupsFetching);
  const isProjectSearchPending =
    Boolean(connectionId) &&
    scope === GitLabSyncScope.Project &&
    (normalizeGitLabSearch(projectSearch) !== normalizeGitLabSearch(debouncedProjectSearch) ||
      isProjectsFetching);

  const groupsErrorMessage = getGitLabSearchErrorMessage(groupsError, "groups");
  const projectsErrorMessage = getGitLabSearchErrorMessage(projectsError, "projects");

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.groupId", "");
          setValue("destinationConfig.groupName", "");
          setValue("destinationConfig.scope", GitLabSyncScope.Project);
          setProjectSearch("");
          setGroupSearch("");
        }}
      />

      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={GitLabSyncScope.Project}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Scope</FieldLabel>
            <FieldContent>
              <Select
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  setValue("destinationConfig.projectId", "");
                  setValue("destinationConfig.projectName", "");
                  setValue("destinationConfig.groupId", "");
                  setValue("destinationConfig.groupName", "");
                  setProjectSearch("");
                  setGroupSearch("");
                }}
              >
                <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a scope..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(GitLabSyncScope).map((projectScope) => (
                    <SelectItem className="capitalize" value={projectScope} key={projectScope}>
                      {projectScope.replace("-", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      {scope === GitLabSyncScope.Group && (
        <Controller
          name="destinationConfig.groupId"
          control={control}
          render={({ field: { onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Group
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    Ensure the group exists in the connection&apos;s GitLab instance URL. Only the
                    first results are shown, search by name to find more.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <Combobox
                  isError={Boolean(error)}
                  isLoading={isGroupSearchPending}
                  loadingMessage="Loading GitLab groups..."
                  isDisabled={!connectionId}
                  value={groupId || null}
                  onValueChange={(option) => {
                    const selected = groups?.find((item) => item.id === option);
                    if (!selected || option === groupId) return;
                    onChange(option);
                    setValue("destinationConfig.groupName", selected?.fullName ?? "", {
                      shouldDirty: true
                    });
                  }}
                  onClear={() => {
                    onChange("");
                    setValue("destinationConfig.groupName", "", { shouldDirty: true });
                    setGroupSearch("");
                  }}
                  clearAriaLabel="Clear group"
                  onInputValueChange={(newValue) => setGroupSearch(newValue)}
                  shouldFilter={false}
                  includeMissingSelectedOptions={!groupSearch && !groupsError}
                  options={(groups ?? []).map((item) => item.id)}
                  placeholder="Search for a group..."
                  getOptionLabel={(id) =>
                    groups?.find((item) => item.id === id)?.fullPath ?? (groupName || id)
                  }
                  renderOption={(id) => {
                    const item = groups?.find((option) => option.id === id);
                    return item ? renderGitLabGroupOption(item) : groupName || id;
                  }}
                  getOptionValue={(id) => id}
                  emptyMessage={(inputValue) =>
                    groupsErrorMessage ??
                    (inputValue ? "No groups found matching your search." : "No groups found.")
                  }
                  modal
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}

      {scope === GitLabSyncScope.Project && (
        <Controller
          name="destinationConfig.projectId"
          control={control}
          render={({ field: { onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                GitLab Project
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    Ensure the project exists in the connection&apos;s GitLab instance URL and the
                    connection has access to it. Only the first results are shown, search by name to
                    find more.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <Combobox
                  isError={Boolean(error)}
                  isLoading={isProjectSearchPending}
                  loadingMessage="Loading GitLab projects..."
                  isDisabled={!connectionId}
                  value={projectId || null}
                  onValueChange={(option) => {
                    const selected = projects?.find((item) => item.id === option);
                    if (!selected || option === projectId) return;
                    onChange(option);
                    setValue("destinationConfig.projectName", selected?.name ?? "", {
                      shouldDirty: true
                    });
                  }}
                  onClear={() => {
                    onChange("");
                    setValue("destinationConfig.projectName", "", { shouldDirty: true });
                    setProjectSearch("");
                  }}
                  clearAriaLabel="Clear GitLab project"
                  onInputValueChange={(newValue) => setProjectSearch(newValue)}
                  shouldFilter={false}
                  includeMissingSelectedOptions={!projectSearch && !projectsError}
                  options={(projects ?? []).map((item) => item.id)}
                  placeholder="Search for a project..."
                  getOptionLabel={(id) =>
                    projects?.find((item) => item.id === id)?.name ?? (projectName || id)
                  }
                  renderOption={(id) => {
                    const item = projects?.find((option) => option.id === id);
                    return item ? renderGitLabProjectOption(item) : projectName || id;
                  }}
                  getOptionValue={(id) => id}
                  emptyMessage={(inputValue) =>
                    projectsErrorMessage ??
                    (inputValue ? "No projects found matching your search." : "No projects found.")
                  }
                  modal
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}

      <Controller
        control={control}
        defaultValue=""
        name="destinationConfig.targetEnvironment"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>GitLab Environment Scope (Optional)</FieldLabel>
            <FieldContent>
              <Input {...field} placeholder="*" isError={Boolean(error)} />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <div className="flex flex-col gap-4">
        <Controller
          control={control}
          name="destinationConfig.shouldProtectSecrets"
          render={({ field: { onChange, value } }) => (
            <SecretProtectionOption
              id="should-protect-secrets"
              title="Mark secrets as Protected"
              description="When enabled, variables are only exposed to pipelines running on protected branches and protected tags in GitLab."
              isEnabled={value || false}
              onChange={onChange}
            />
          )}
        />

        <Controller
          control={control}
          name="destinationConfig.shouldMaskSecrets"
          render={({ field: { onChange, value } }) => (
            <SecretProtectionOption
              id="should-mask-secrets"
              title="Mark secrets as Masked"
              description="GitLab hides masked variables in job logs. Variables must be at least 8 characters and meet GitLab's masking requirements to be masked successfully."
              isEnabled={value || false}
              onChange={(checked) => {
                onChange(checked);
                if (!checked) {
                  setValue("destinationConfig.shouldHideSecrets", false);
                }
              }}
            />
          )}
        />

        <Controller
          control={control}
          name="destinationConfig.shouldHideSecrets"
          render={({ field: { onChange, value } }) => (
            <SecretProtectionOption
              id="should-hide-secrets"
              title="Mark secrets as Hidden"
              description="Hides the variable value in the GitLab UI. Requires masking to be enabled. Once enabled, Infisical can no longer unhide or unmask the variable from GitLab."
              isEnabled={value || false}
              onChange={onChange}
              isDisabled={!shouldMaskSecrets}
            />
          )}
        />
      </div>
    </FieldGroup>
  );
};
