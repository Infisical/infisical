import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
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

const formatGitLabGroupOptionLabel = (group: TGitLabGroup) => (
  <div className="flex min-w-0 items-center gap-2">
    <span className="shrink-0">{group.name}</span>
    {group.fullPath !== group.name && (
      <span className="min-w-0 truncate text-muted">{group.fullPath}</span>
    )}
  </div>
);

const formatGitLabProjectOptionLabel = (project: TGitLabProject) => {
  const fullPathWithNamespace = project.name;
  const shortName = fullPathWithNamespace.split("/").pop() || fullPathWithNamespace;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0">{shortName}</span>
      {fullPathWithNamespace !== shortName && (
        <span className="min-w-0 truncate text-muted">{fullPathWithNamespace}</span>
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
      <Switch
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
  const [debouncedProjectSearch] = useDebounce(projectSearch, 300);
  const [groupSearch, setGroupSearch] = useState("");
  const [debouncedGroupSearch] = useDebounce(groupSearch, 300);

  const connectionId = useWatch({ name: "connection.id", control });
  const scope = useWatch({ name: "destinationConfig.scope", control });
  const shouldMaskSecrets = useWatch({ name: "destinationConfig.shouldMaskSecrets", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });
  const projectName = useWatch({ name: "destinationConfig.projectName", control });
  const groupId = useWatch({ name: "destinationConfig.groupId", control });
  const groupName = useWatch({ name: "destinationConfig.groupName", control });

  const { data: groups, isLoading: isGroupsLoading } = useGitLabConnectionListGroups(
    connectionId,
    debouncedGroupSearch || undefined,
    {
      enabled: Boolean(connectionId) && scope === GitLabSyncScope.Group
    }
  );

  const { data: projects, isLoading: isProjectsLoading } = useGitLabConnectionListProjects(
    connectionId,
    debouncedProjectSearch || undefined,
    {
      enabled: Boolean(connectionId) && scope === GitLabSyncScope.Project
    }
  );

  // The provider only returns the first page, so the currently-selected item may not be in the
  // results. Surface it from the stored name so the selection always renders (e.g. when editing).
  const groupOptions = useMemo(() => {
    const results = groups ?? [];
    if (groupId && groupName && !results.some((group) => group.id === groupId)) {
      return [
        { id: groupId, name: groupName, fullName: groupName, fullPath: groupName },
        ...results
      ];
    }
    return results;
  }, [groups, groupId, groupName]);

  const projectOptions = useMemo(() => {
    const results = projects ?? [];
    if (projectId && projectName && !results.some((project) => project.id === projectId)) {
      return [{ id: projectId, name: projectName }, ...results];
    }
    return results;
  }, [projects, projectId, projectName]);

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
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Group
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    Ensure the group exists in the connection&apos;s GitLab instance URL. Only the
                    first results are shown — search by name to find more.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <FilterableSelect
                  isLoading={isGroupsLoading && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={groupOptions.find((group) => group.id === value) ?? null}
                  onChange={(option) => {
                    const selected = option as SingleValue<TGitLabGroup>;
                    onChange(selected?.id ?? "");
                    setValue("destinationConfig.groupName", selected?.fullName ?? "", {
                      shouldDirty: true
                    });
                  }}
                  onInputChange={(newValue) => setGroupSearch(newValue)}
                  filterOption={null}
                  options={groupOptions}
                  placeholder="Search for a group..."
                  getOptionLabel={(option) => `${option.name} · ${option.fullPath}`}
                  formatOptionLabel={formatGitLabGroupOptionLabel}
                  getOptionValue={(option) => option.id}
                  noOptionsMessage={({ inputValue }) =>
                    inputValue ? "No groups found matching your search." : "No groups found."
                  }
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
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                GitLab Project
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    Ensure the project exists in the connection&apos;s GitLab instance URL and the
                    connection has access to it. Only the first results are shown — search by name
                    to find more.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <FilterableSelect
                  isLoading={isProjectsLoading && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={projectOptions.find((project) => project.id === value) ?? null}
                  onChange={(option) => {
                    const selected = option as SingleValue<TGitLabProject>;
                    onChange(selected?.id ?? "");
                    setValue("destinationConfig.projectName", selected?.name ?? "", {
                      shouldDirty: true
                    });
                  }}
                  onInputChange={(newValue) => setProjectSearch(newValue)}
                  filterOption={null}
                  options={projectOptions}
                  placeholder="Search for a project..."
                  getOptionLabel={(option) => {
                    const shortName = option.name.split("/").pop() || option.name;
                    return `${shortName} · ${option.name}`;
                  }}
                  formatOptionLabel={formatGitLabProjectOptionLabel}
                  getOptionValue={(option) => option.id}
                  noOptionsMessage={({ inputValue }) =>
                    inputValue ? "No projects found matching your search." : "No projects found."
                  }
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
