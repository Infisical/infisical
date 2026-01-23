import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import { TCircleCIProject, useCircleCIConnectionListProjects } from "@app/hooks/api/appConnections/circleci";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const CircleCISyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CircleCI }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const { data: projects = [], isPending: isProjectsPending } = useCircleCIConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectSlug", "");
          setValue("destinationConfig.projectName", "");
        }}
      />

      <Controller
        name="destinationConfig.projectSlug"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Project"
          >
            <FilterableSelect
              isLoading={isProjectsPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={projects.find((project) => project.slug === value) ?? null}
              onChange={(option) => {
                const selectedProject = option as SingleValue<TCircleCIProject>;
                onChange(selectedProject?.slug ?? "");
                setValue("destinationConfig.projectName", selectedProject?.name ?? "");
              }}
              options={projects}
              placeholder="Select a project..."
              getOptionLabel={(option) => option.name || option.slug}
              getOptionValue={(option) => option.slug}
            />
          </FormControl>
        )}
      />
    </>
  );
};
