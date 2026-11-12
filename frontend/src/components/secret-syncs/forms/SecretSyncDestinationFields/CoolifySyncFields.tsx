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
import {
  useCoolifyConnectionListApplications,
  useCoolifyConnectionListProjectEnvironments,
  useCoolifyConnectionListProjects
} from "@app/hooks/api/appConnections/coolify/queries";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const CoolifySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Coolify }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });
  const environmentId = useWatch({ name: "destinationConfig.environmentId", control });

  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    error: projectsError
  } = useCoolifyConnectionListProjects(connectionId, {
    enabled: Boolean(connectionId)
  });

  const {
    data: projectEnvironments = [],
    isLoading: isProjectEnvironmentsLoading,
    error: projectEnvironmentsError
  } = useCoolifyConnectionListProjectEnvironments(connectionId, projectId ?? "", {
    enabled: Boolean(connectionId) && Boolean(projectId)
  });

  const {
    data: applications = [],
    isLoading: isApplicationsLoading,
    error: applicationsError
  } = useCoolifyConnectionListApplications(connectionId, environmentId ?? 0, {
    enabled: Boolean(connectionId) && Boolean(environmentId)
  });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.environmentId", undefined);
          setValue("destinationConfig.environmentName", "");
          setValue("destinationConfig.appId", "");
          setValue("destinationConfig.appName", "");
        }}
      />

      <Controller
        name="destinationConfig.projectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-coolify-project-id-label"
              htmlFor="secret-sync-coolify-project-id"
            >
              Select a project
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-coolify-project-id-label"
                aria-describedby={error ? "secret-sync-coolify-project-id-error" : undefined}
                id="secret-sync-coolify-project-id"
                isError={Boolean(error)}
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projects.find((p) => p.uuid === value) ?? null}
                onValueChange={(option) => {
                  onChange(option?.uuid ?? "");
                  setValue("destinationConfig.projectName", option?.name ?? "");
                  setValue("destinationConfig.environmentId", undefined);
                  setValue("destinationConfig.environmentName", "");
                  setValue("destinationConfig.appId", "");
                  setValue("destinationConfig.appName", "");
                }}
                options={projects}
                placeholder="Select a project..."
                emptyMessage={
                  projectsError
                    ? "Unable to load Coolify projects. Check connection credentials."
                    : undefined
                }
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.uuid}
                getOptionKeywords={(option) => [option.uuid]}
                modal
              />
              <FieldError id="secret-sync-coolify-project-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.environmentId"
        control={control}
        disabled={!connectionId || !projectId}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-coolify-environment-id-label"
              htmlFor="secret-sync-coolify-environment-id"
            >
              Select an environment
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-coolify-environment-id-label"
                aria-describedby={error ? "secret-sync-coolify-environment-id-error" : undefined}
                id="secret-sync-coolify-environment-id"
                isError={Boolean(error)}
                isLoading={
                  isProjectEnvironmentsLoading && Boolean(connectionId) && Boolean(projectId)
                }
                isDisabled={!connectionId || !projectId}
                value={projectEnvironments.find((e) => e.id === value) ?? null}
                onValueChange={(option) => {
                  onChange(option?.id ?? undefined);
                  setValue("destinationConfig.environmentName", option?.name ?? "");
                  setValue("destinationConfig.appId", "");
                  setValue("destinationConfig.appName", "");
                }}
                options={projectEnvironments}
                placeholder="Select an environment..."
                emptyMessage={
                  projectEnvironmentsError ? "Unable to load Coolify environments." : undefined
                }
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => String(option.id)}
                getOptionKeywords={(option) => [option.uuid, String(option.id)]}
                modal
              />
              <FieldError id="secret-sync-coolify-environment-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.appId"
        control={control}
        disabled={!connectionId || !environmentId}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel id="secret-sync-coolify-app-id-label" htmlFor="secret-sync-coolify-app-id">
              Select an application
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-coolify-app-id-label"
                aria-describedby={error ? "secret-sync-coolify-app-id-error" : undefined}
                id="secret-sync-coolify-app-id"
                isError={Boolean(error)}
                isLoading={isApplicationsLoading && Boolean(connectionId) && Boolean(environmentId)}
                isDisabled={!connectionId || !environmentId}
                value={applications.find((a) => a.uuid === value) ?? null}
                onValueChange={(option) => {
                  onChange(option?.uuid ?? "");
                  setValue("destinationConfig.appName", option?.name ?? "");
                }}
                options={applications}
                placeholder="Select an application..."
                emptyMessage={
                  applicationsError ? "Unable to load Coolify applications." : undefined
                }
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.uuid}
                getOptionKeywords={(option) => [option.uuid]}
                modal
              />
              <FieldError id="secret-sync-coolify-app-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
