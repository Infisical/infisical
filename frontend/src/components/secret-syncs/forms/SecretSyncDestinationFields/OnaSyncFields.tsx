import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@app/components/v3";
import { useOnaConnectionListProjects } from "@app/hooks/api/appConnections/ona";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const OnaSyncFields = () => {
  const { control, setValue } = useFormContext<TSecretSyncForm & { destination: SecretSync.Ona }>();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: projects, isLoading: isProjectsLoading } = useOnaConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
        }}
      />

      <Controller
        name="destinationConfig.projectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Ona Project</FieldLabel>
            <FieldContent>
              <Combobox
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projects?.find((p) => p.id === value) ?? null}
                onValueChange={(option) => {
                  const selected = option;
                  onChange(selected?.id ?? "");
                  setValue("destinationConfig.projectName", selected?.name ?? "");
                }}
                options={projects ?? []}
                placeholder="Select a project..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                modal
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
