import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useOnaConnectionListProjects } from "@app/hooks/api/appConnections/ona";
import { TOnaProject } from "@app/hooks/api/appConnections/ona/types";
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
              <FilterableSelect
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projects?.find((p) => p.id === value) ?? null}
                onChange={(option) => {
                  const selected = option as SingleValue<TOnaProject>;
                  onChange(selected?.id ?? "");
                  setValue("destinationConfig.projectName", selected?.name ?? "");
                }}
                options={projects ?? []}
                placeholder="Select a project..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
