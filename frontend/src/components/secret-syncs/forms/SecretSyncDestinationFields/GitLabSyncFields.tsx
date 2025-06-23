import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  FilterableSelect,
  FormControl,
  Input,
  Select,
  SelectItem,
  Switch,
  Tooltip
} from "@app/components/v2";
import {
  TGitLabGroup,
  TGitLabProject,
  useGitlabConnectionListGroups,
  useGitlabConnectionListProjects
} from "@app/hooks/api/appConnections/gitlab";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GitlabSyncScope } from "@app/hooks/api/secretSyncs/types/gitlab-sync";

import { TSecretSyncForm } from "../schemas";

const SecretProtectionOption = ({
  title,
  isEnabled,
  onChange,
  id,
  isDisabled = false,
  tooltip
}: {
  title: string;
  isEnabled: boolean;
  onChange: (checked: boolean) => void;
  id: string;
  isDisabled?: boolean;
  tooltip?: string;
}) => {
  return (
    <div className="flex items-start justify-between rounded-lg border border-mineshaft-600 bg-mineshaft-800/50 p-4 transition-all duration-200 hover:border-mineshaft-500">
      <div className="flex flex-1 items-start space-x-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h4 className="text-sm font-medium text-bunker-100">{title}</h4>
            {tooltip && (
              <Tooltip className="max-w-sm" content={tooltip}>
                <FontAwesomeIcon
                  icon={faCircleInfo}
                  className="cursor-help text-xs text-mineshaft-400 hover:text-mineshaft-300"
                />
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      <div className="ml-4 flex-shrink-0">
        <Switch id={id} onCheckedChange={onChange} isChecked={isEnabled} isDisabled={isDisabled} />
      </div>
    </div>
  );
};

export const GitLabSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.GitLab }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const scope = useWatch({ name: "destinationConfig.scope", control });
  const selectedGroup = useWatch({ name: "destinationConfig.groupId", control });
  const shouldMaskSecrets = useWatch({ name: "destinationConfig.shouldMaskSecrets", control });

  const { data: groups, isLoading: isGroupsLoading } = useGitlabConnectionListGroups(connectionId, {
    enabled: Boolean(connectionId) && scope === GitlabSyncScope.Group
  });

  const { data: projects, isLoading: isProjectsLoading } = useGitlabConnectionListProjects(
    connectionId,
    selectedGroup,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <div className="h-[calc(100vh-20rem)] overflow-auto">
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.groupId", "");
          setValue("destinationConfig.scope", GitlabSyncScope.Individual);
        }}
      />

      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={GitlabSyncScope.Individual}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl errorText={error?.message} isError={Boolean(error?.message)} label="Scope">
            <Select
              value={value}
              onValueChange={(val) => {
                onChange(val);
                setValue("destinationConfig.projectId", "");
                setValue("destinationConfig.projectName", "");
                setValue("destinationConfig.groupId", "");
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select a scope..."
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(GitlabSyncScope).map((projectScope) => (
                <SelectItem className="capitalize" value={projectScope} key={projectScope}>
                  {projectScope.replace("-", " ")}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />

      {scope === GitlabSyncScope.Group && (
        <Controller
          name="destinationConfig.groupId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Group"
              helperText={
                <Tooltip
                  className="max-w-md"
                  content="Ensure the group exists in the connection's GitLab instance URL."
                >
                  <div>
                    <span>Don&#39;t see the group you&#39;re looking for?</span>{" "}
                    <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                  </div>
                </Tooltip>
              }
            >
              <FilterableSelect
                menuPlacement="top"
                isLoading={isGroupsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={groups?.find((group) => group.id === value) ?? null}
                onChange={(option) => {
                  onChange((option as SingleValue<TGitLabGroup>)?.id ?? "");
                }}
                options={groups}
                placeholder="Select a group..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
            </FormControl>
          )}
        />
      )}

      <Controller
        name="destinationConfig.projectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="GitLab Project"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the project exists in the connection's GitLab instance URL."
              >
                <div>
                  <span>Don&#39;t see the project you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId || (scope === GitlabSyncScope.Group && !selectedGroup)}
              value={projects?.find((project) => project.id === value) ?? null}
              onChange={(option) => {
                onChange((option as SingleValue<TGitLabProject>)?.id ?? "");
                setValue(
                  "destinationConfig.projectName",
                  (option as SingleValue<TGitLabProject>)?.name ?? ""
                );
              }}
              options={projects}
              placeholder="Select a project..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />

      <Controller
        control={control}
        defaultValue=""
        name="destinationConfig.targetEnvironment"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="GitLab Environment Scope (Optional)"
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input {...field} placeholder="*" />
          </FormControl>
        )}
      />

      {/* Secret Protection Settings Section */}
      <div className="mt-6">
        <div className="space-y-4">
          <Controller
            control={control}
            name="destinationConfig.shouldProtectSecrets"
            render={({ field: { onChange, value } }) => (
              <SecretProtectionOption
                id="should-protect-secrets"
                title="Mark Infisical secrets in GitLab as 'Protected' secrets"
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
                title="Mark Infisical secrets in GitLab as 'Masked' secrets"
                tooltip="GitLab has limitations for masked variables: secrets must be at least 8 characters long and not match existing CI/CD variable names. Secrets not meeting these criteria won't be masked."
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
              <div className="max-h-32 opacity-100 transition-all duration-300">
                <SecretProtectionOption
                  id="should-hide-secrets"
                  title="Mark Infisical secrets in GitLab as 'Hidden' secrets"
                  tooltip="Secrets can only be marked as hidden if they are also masked."
                  isEnabled={value || false}
                  onChange={onChange}
                  isDisabled={!shouldMaskSecrets}
                />
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
};
