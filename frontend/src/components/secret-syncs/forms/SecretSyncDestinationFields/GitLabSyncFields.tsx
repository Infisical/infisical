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
import { TGitLabGroup, useGitLabConnectionListGroups } from "@app/hooks/api/appConnections/gitlab";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GitLabSyncScope } from "@app/hooks/api/secretSyncs/types/gitlab-sync";

import { TSecretSyncForm } from "../schemas";
import { GitLabProjectPicker } from "./GitLabProjectPicker";

const ProjectPickerField = ({
  connectionId,
  selectedProjectId,
  isError
}: {
  connectionId: string;
  selectedProjectId: string;
  isError?: boolean;
}) => {
  const { setValue } = useFormContext<TSecretSyncForm & { destination: SecretSync.GitLab }>();

  return (
    <GitLabProjectPicker
      connectionId={connectionId}
      selectedProjectId={selectedProjectId}
      isError={isError}
      onChange={(project) => {
        setValue("destinationConfig.projectId", project.id, {
          shouldDirty: true,
          shouldValidate: true
        });
        setValue("destinationConfig.projectName", project.name, { shouldDirty: true });
      }}
    />
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

  const connectionId = useWatch({ name: "connection.id", control });
  const scope = useWatch({ name: "destinationConfig.scope", control });
  const shouldMaskSecrets = useWatch({ name: "destinationConfig.shouldMaskSecrets", control });

  const { data: groups, isLoading: isGroupsLoading } = useGitLabConnectionListGroups(connectionId, {
    enabled: Boolean(connectionId) && scope === GitLabSyncScope.Group
  });

  return (
    <FieldGroup>
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
                    Ensure the group exists in the connection&apos;s GitLab instance URL.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <FilterableSelect
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
          render={({ field: { value }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                GitLab Project
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    Ensure the project exists in the connection&apos;s GitLab instance URL and the
                    connection has access to it.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <ProjectPickerField
                  connectionId={connectionId}
                  selectedProjectId={value}
                  isError={Boolean(error)}
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
