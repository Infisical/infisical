import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import {
  TTeamCityProjectWithBuildTypes,
  useTeamCityConnectionListProjects
} from "@app/hooks/api/appConnections/teamcity";
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

  // For Build Config dropdown
  const selectedProjectId = useWatch({ name: "destinationConfig.project", control });
  const selectedProject = projects?.find((proj) => proj.id === selectedProjectId);

  const buildTypes = selectedProject?.buildTypes?.buildType || [];

  return (
    <>
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
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Project"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the project exists in the connection's TeamCity instance URL."
              >
                <div>
                  <span>Don&#39;t see the project you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={projects?.find((proj) => proj.id === value) ?? null}
              onChange={(option) => {
                onChange((option as SingleValue<TTeamCityProjectWithBuildTypes>)?.id ?? null);
                setValue("destinationConfig.buildConfig", "");
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
        name="destinationConfig.buildConfig"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            isOptional
            label="Build Configuration"
            helperText={
              <Tooltip
                className="max-w-md"
                content='Ensure the configuration exists in the selected project and that your Access Token has the "View build configuration settings" permission.'
              >
                <div>
                  <span>Don&#39;t see the configuration you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId || !selectedProject}
              value={buildTypes.find((buildType) => buildType.id === value) ?? null}
              onChange={(option) => {
                const selectedOption = option as SingleValue<{ id: string; name: string }>;
                onChange(selectedOption?.id ?? "");
              }}
              options={buildTypes}
              isClearable
              placeholder="Select a build configuration..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />

      <span className="text-sm text-bunker-300">
        Not selecting a Build Configuration will sync your secrets to the entire project.
      </span>
    </>
  );
};
