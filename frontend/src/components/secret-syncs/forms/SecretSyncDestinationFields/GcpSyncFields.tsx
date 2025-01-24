import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import { useGcpConnectionListProjects } from "@app/hooks/api/appConnections/gcp/queries";
import { TGitHubConnectionEnvironment } from "@app/hooks/api/appConnections/github";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const GcpSyncFields = () => {
  const { control, setValue } = useFormContext<TSecretSyncForm & { destination: SecretSync.GCP }>();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: projects, isPending } = useGcpConnectionListProjects(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
        }}
      />
      <Controller
        name="destinationConfig.projectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Project">
            <FilterableSelect
              menuPlacement="top"
              isLoading={isPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={projects?.find((project) => project.id === value) ?? null}
              onChange={(option) =>
                onChange((option as SingleValue<TGitHubConnectionEnvironment>)?.id ?? null)
              }
              options={projects}
              placeholder="Select a GCP project..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id.toString()}
            />
          </FormControl>
        )}
      />
    </>
  );
};
