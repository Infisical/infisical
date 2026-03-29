import { useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { MultiValue, SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import {
  TRailwayProject,
  useRailwayConnectionListProjects
} from "@app/hooks/api/appConnections/railway";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

type TRailwayService = { id: string; name: string };

export const RailwaySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Railway }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });
  // Watch legacy serviceId for backward compatibility with existing syncs
  const legacyServiceId = useWatch({ name: "destinationConfig.serviceId", control });

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
          setValue("destinationConfig.serviceIds", []);
          setValue("destinationConfig.serviceNames", []);
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.environmentName", "");
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
        name="destinationConfig.serviceIds"
        disabled={!connectionId || !projectId}
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Select services"
            tooltipClassName="max-w-md"
            tooltipText="By default secrets are created as shared variables in Railway."
            helperText="Scope your secrets to one or more services within the environment."
          >
            <FilterableSelect
              isMulti
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={services.filter((s) => {
                // Support legacy single-service syncs that only have serviceId
                const effectiveIds = value?.length ? value : (legacyServiceId ? [legacyServiceId] : []);
                return effectiveIds.includes(s.id);
              })}
              onChange={(option) => {
                const selected = option as MultiValue<TRailwayService>;
                onChange(selected.map((s) => s.id));
                setValue(
                  "destinationConfig.serviceNames",
                  selected.map((s) => s.name)
                );
              }}
              options={services}
              placeholder="Select one or more services..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
    </>
  );
};
