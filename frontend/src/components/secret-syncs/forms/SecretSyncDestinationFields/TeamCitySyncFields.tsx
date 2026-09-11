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
import { useTeamCityConnectionListProjects } from "@app/hooks/api/appConnections/teamcity";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const TeamCitySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.TeamCity }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: projects, isLoading: isProjectsLoading } = useTeamCityConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const selectedProjectId = useWatch({ name: "destinationConfig.project", control });
  const selectedProject = projects?.find((proj) => proj.id === selectedProjectId);

  const buildTypes = selectedProject?.buildTypes?.buildType || [];

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.project", "");
          setValue("destinationConfig.buildConfig", "");
        }}
      />

      <Controller
        name="destinationConfig.project"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-team-city-project-label"
              htmlFor="secret-sync-team-city-project"
            >
              Project
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure the project exists in the connection&apos;s TeamCity instance URL.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-team-city-project-label"
                aria-describedby={error ? "secret-sync-team-city-project-error" : undefined}
                id="secret-sync-team-city-project"
                isError={Boolean(error)}
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projects?.find((proj) => proj.id === value) ?? null}
                onValueChange={(option) => {
                  onChange(option.id ?? null);
                  setValue("destinationConfig.buildConfig", "");
                }}
                options={projects}
                placeholder="Select a project..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldError id="secret-sync-team-city-project-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.buildConfig"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-team-city-build-config-label"
              htmlFor="secret-sync-team-city-build-config"
            >
              Build Configuration (Optional)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure the configuration exists in the selected project and that your Access Token
                  has the &quot;View build configuration settings&quot; permission.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-team-city-build-config-label"
                aria-describedby={
                  error
                    ? "secret-sync-team-city-build-config-description secret-sync-team-city-build-config-error"
                    : "secret-sync-team-city-build-config-description"
                }
                id="secret-sync-team-city-build-config"
                isError={Boolean(error)}
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId || !selectedProject}
                value={buildTypes.find((buildType) => buildType.id === value) ?? null}
                onValueChange={(option) => {
                  const selectedOption = option;
                  onChange(selectedOption?.id ?? "");
                }}
                onClear={() => onChange("")}
                options={buildTypes}
                placeholder="Select a build configuration..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldDescription id="secret-sync-team-city-build-config-description">
                Not selecting a Build Configuration will sync your secrets to the entire project.
              </FieldDescription>
              <FieldError id="secret-sync-team-city-build-config-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
