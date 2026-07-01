import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Input
} from "@app/components/v3";
import {
  TRundeckProject,
  useRundeckConnectionListProjects
} from "@app/hooks/api/appConnections/rundeck";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const RundeckSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Rundeck }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: projects = [], isPending: isProjectsLoading } = useRundeckConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.project", "");
        }}
      />
      <Controller
        name="destinationConfig.project"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Project</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projects.find((project) => project.name === value) ?? null}
                onChange={(option) => {
                  const selected = option as SingleValue<TRundeckProject>;
                  onChange(selected?.name ?? "");
                }}
                options={projects}
                placeholder="Select a project..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.path"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Path</FieldLabel>
            <FieldContent>
              <Input
                value={value}
                onChange={onChange}
                placeholder="/production"
                isError={Boolean(error)}
              />
              <FieldDescription>
                {
                  "Path must start with '/'. Secrets are stored in Rundeck Key Storage under keys/project/<project><path>."
                }
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
