import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useRundeckConnectionListProjects } from "@app/hooks/api/appConnections/rundeck";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

const PATH_HELP_TEXT =
  "Path must start with '/'. Secrets are stored in Rundeck Key Storage under keys/project/<project><path>.";

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
            <FieldLabel
              id="secret-sync-rundeck-project-label"
              htmlFor="secret-sync-rundeck-project"
            >
              Project
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-rundeck-project-label"
                aria-describedby={error ? "secret-sync-rundeck-project-error" : undefined}
                id="secret-sync-rundeck-project"
                isError={Boolean(error)}
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projects.find((project) => project.name === value) ?? null}
                onValueChange={(option) => {
                  const selected = option;
                  onChange(selected?.name ?? "");
                }}
                options={projects}
                placeholder="Select a project..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
                modal
              />
              <FieldError id="secret-sync-rundeck-project-error" errors={[error]} />
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
              <FieldDescription>{PATH_HELP_TEXT}</FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
