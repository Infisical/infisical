import { useMemo } from "react";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
    <FieldGroup>
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
          <Field>
            <FieldLabel>Select a project</FieldLabel>
            <FieldContent>
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
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.environmentId"
        disabled={!connectionId || !projectId}
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Select an environment</FieldLabel>
            <FieldContent>
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
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.serviceId"
        disabled={!connectionId || !projectId}
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Select a service
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  By default secrets are created as shared variables in Railway.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
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
              <FieldDescription>
                Scope your secrets to a specific service within the environment.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
