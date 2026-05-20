import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo, faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
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
import { TGitLabGroup, useGitLabConnectionListGroups } from "@app/hooks/api/appConnections/gitlab";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GitLabSyncScope } from "@app/hooks/api/secretSyncs/types/gitlab-sync";

import { GitLabProjectNavigator } from "./GitLabProjectNavigator";

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
    <Switch
      className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
      id={id}
      thumbClassName="bg-mineshaft-800"
      onCheckedChange={onChange}
      isChecked={isEnabled}
      isDisabled={isDisabled}
      containerClassName="w-full"
    >
      <p>
        {title}{" "}
        {tooltip && (
          <Tooltip className="max-w-md" content={tooltip}>
            <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
          </Tooltip>
        )}
      </p>
    </Switch>
  );
};

export const GitLabSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.GitLab }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const scope = useWatch({ name: "destinationConfig.scope", control });
  const shouldMaskSecrets = useWatch({ name: "destinationConfig.shouldMaskSecrets", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });
  const projectName = useWatch({ name: "destinationConfig.projectName", control });

  const { data: groups, isLoading: isGroupsLoading } = useGitLabConnectionListGroups(connectionId, {
    enabled: Boolean(connectionId) && scope === GitLabSyncScope.Group
  });

  return (
    <div className="h-full overflow-auto">
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.groupId", "");
          setValue("destinationConfig.groupName", "");
          setValue("destinationConfig.scope", GitLabSyncScope.Project);
        }}
      />

      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={GitLabSyncScope.Project}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl errorText={error?.message} isError={Boolean(error?.message)} label="Scope">
            <Select
              value={value}
              onValueChange={(val) => {
                onChange(val);
                setValue("destinationConfig.projectId", "");
                setValue("destinationConfig.projectName", "");
                setValue("destinationConfig.groupId", "");
                setValue("destinationConfig.groupName", "");
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select a scope..."
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(GitLabSyncScope).map((projectScope) => (
                <SelectItem className="capitalize" value={projectScope} key={projectScope}>
                  {projectScope.replace("-", " ")}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />

      {scope === GitLabSyncScope.Group && (
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
                  setValue(
                    "destinationConfig.groupName",
                    (option as SingleValue<TGitLabGroup>)?.fullName ?? ""
                  );
                }}
                options={groups}
                placeholder="Select a group..."
                getOptionLabel={(option) => option.fullName}
                getOptionValue={(option) => option.id}
              />
            </FormControl>
          )}
        />
      )}

      {scope === GitLabSyncScope.Project && (
        <Controller
          name="destinationConfig.projectId"
          control={control}
          render={({ fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="GitLab Project"
              helperText={
                <Tooltip
                  className="max-w-md"
                  content="Navigate through your GitLab groups to find and select a project."
                >
                  <div>
                    <span>Browse groups to find your project</span>{" "}
                    <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                  </div>
                </Tooltip>
              }
            >
              <GitLabProjectNavigator
                connectionId={connectionId}
                value={projectId ?? ""}
                projectName={projectName ?? ""}
                onChange={(id, name) => {
                  setValue("destinationConfig.projectId", id);
                  setValue("destinationConfig.projectName", name);
                }}
                isDisabled={!connectionId}
              />
            </FormControl>
          )}
        />
      )}

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
                title="Mark secrets as Protected"
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
                  title="Mark secrets as Hidden"
                  tooltip="Secrets can only be marked as hidden if they are also masked. If this is enabled, Infisical will not be able to unhide/unmask secrets from the sync destination if you disable the option later."
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
