import { useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useRailwayConnectionListProjects } from "@app/hooks/api/appConnections/railway";
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
            <FieldLabel
              id="secret-sync-railway-project-id-label"
              htmlFor="secret-sync-railway-project-id"
            >
              Select a project
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-railway-project-id-label"
                aria-describedby={error ? "secret-sync-railway-project-id-error" : undefined}
                id="secret-sync-railway-project-id"
                isError={Boolean(error)}
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projects.find((p) => p.id === value) ?? null}
                onValueChange={(option) => {
                  const v = option;
                  onChange(v?.id ?? null);
                  setValue("destinationConfig.projectName", v?.name ?? "");
                }}
                options={projects}
                placeholder="Select a project..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldError id="secret-sync-railway-project-id-error" errors={[error]} />
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
            <FieldLabel
              id="secret-sync-railway-environment-id-label"
              htmlFor="secret-sync-railway-environment-id"
            >
              Select an environment
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-railway-environment-id-label"
                aria-describedby={error ? "secret-sync-railway-environment-id-error" : undefined}
                id="secret-sync-railway-environment-id"
                isError={Boolean(error)}
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={environments.find((p) => p.id === value) ?? null}
                onValueChange={(option) => {
                  const v = option;
                  onChange(v?.id ?? null);
                  setValue("destinationConfig.environmentName", v?.name ?? "");
                }}
                options={environments}
                placeholder="Select an environment..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldError id="secret-sync-railway-environment-id-error" errors={[error]} />
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
            <FieldLabel
              id="secret-sync-railway-service-id-label"
              htmlFor="secret-sync-railway-service-id"
            >
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
              <Combobox
                aria-labelledby="secret-sync-railway-service-id-label"
                aria-describedby={
                  error
                    ? "secret-sync-railway-service-id-description secret-sync-railway-service-id-error"
                    : "secret-sync-railway-service-id-description"
                }
                id="secret-sync-railway-service-id"
                isError={Boolean(error)}
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={services.find((p) => p.id === value) ?? null}
                onValueChange={(option) => {
                  const v = option;
                  onChange(v?.id ?? null);
                  setValue("destinationConfig.serviceName", v?.name ?? "");
                }}
                options={services}
                placeholder="Select a service..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldDescription id="secret-sync-railway-service-id-description">
                Scope your secrets to a specific service within the environment.
              </FieldDescription>
              <FieldError id="secret-sync-railway-service-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
