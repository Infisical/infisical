import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import {
  TSupabaseProject,
  TSupabaseProjectBranch,
  useSupabaseConnectionListProjects,
  useSupabaseConnectionListProjectBranches
} from "@app/hooks/api/appConnections/supabase";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const SupabaseSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Supabase }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });

  const { data: projects = [], isPending: isProjectsLoading } = useSupabaseConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const { data: branches = [], isPending: isProjectBranchesLoading } = useSupabaseConnectionListProjectBranches(
    connectionId,
    projectId,
    {
      enabled: Boolean(connectionId) && Boolean(projectId)
    }
  );

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectBranchName", "");
          setValue("destinationConfig.projectBranchId", "");
        }}
      />
      <Controller
        name="destinationConfig.projectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Select a project"
            tooltipClassName="max-w-md"
          >
            <FilterableSelect
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={projects.find((p) => p.id === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TSupabaseProject>;
                onChange(v?.id ?? null);
                setValue("destinationConfig.projectName", v?.name ?? "");
                setValue("destinationConfig.projectBranchName", "");
                setValue("destinationConfig.projectBranchId", "");

              }}
              options={projects}
              placeholder="Select project..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.projectBranchId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Select a branch"
            tooltipClassName="max-w-md"
          >
            <FilterableSelect
              isLoading={isProjectBranchesLoading && Boolean(projectId)}
              isDisabled={!projectId || (branches.length === 0)}
              value={branches.find((p) => p.project_ref === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TSupabaseProjectBranch>;
                onChange(v?.project_ref ?? null);
                setValue("destinationConfig.projectBranchName", v?.name ?? "");
              }}
              options={branches}
              placeholder="Select branch..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.project_ref}
            />
          </FormControl>
        )}
      />
    </>
  );
};
