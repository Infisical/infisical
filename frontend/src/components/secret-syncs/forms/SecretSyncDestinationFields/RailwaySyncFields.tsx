import { useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import {
  TRailwayProject,
  useRailwayConnectionListProjects
} from "@app/hooks/api/appConnections/railway";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const RailwaySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Railway }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });

  const { data: projects = [], isPending: isProjectsLoading } = useRailwayConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const environments = useMemo(() => {
    return projects.find((p) => p.id === projectId)?.environments ?? [];
  }, [projects, projectId]);

  const services = useMemo(() => {
    return projects.find((p) => p.id === projectId)?.services ?? [];
  }, [projects, projectId]);

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.environmentId", "");
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.serviceId", "");
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.environmentName", "");
          setValue("destinationConfig.serviceName", "");
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
                const v = option as SingleValue<TRailwayProject>;
                onChange(v?.id ?? null);
                setValue("destinationConfig.projectName", v?.name ?? "");
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
        name="destinationConfig.environmentId"
        disabled={!connectionId || !projectId}
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Select an environment"
            tooltipClassName="max-w-md"
          >
            <FilterableSelect
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={environments.find((p) => p.id === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TRailwayProject>;
                onChange(v?.id ?? null);
                setValue("destinationConfig.environmentName", v?.name ?? "");
              }}
              options={environments}
              placeholder="Select an environment..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.serviceId"
        disabled={!connectionId || !projectId}
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Select a service"
            tooltipClassName="max-w-md"
            tooltipText="By default secrets are created as shared variables in Railway."
            helperText="Scope your secrets to a specific service within the environment."
          >
            <FilterableSelect
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={services.find((p) => p.id === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TRailwayProject>;
                onChange(v?.id ?? null);
                setValue("destinationConfig.serviceName", v?.name ?? "");
              }}
              options={services}
              placeholder="Select a service..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
    </>
  );
};
