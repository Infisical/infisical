import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import {
  useCoolifyConnectionListApplications,
  useCoolifyConnectionListProjectEnvironments,
  useCoolifyConnectionListProjects
} from "@app/hooks/api/appConnections/coolify/queries";
import {
  TCoolifyApplication,
  TCoolifyProject,
  TCoolifyProjectEnvironment
} from "@app/hooks/api/appConnections/coolify/types";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { SecretSyncConnectionField } from "../SecretSyncConnectionField";

export const CoolifySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Coolify }
  >();
  const connectionId = useWatch({ name: "connection.id", control });
  const [projectId, setProjectId] = useState<string | undefined>();
  const [environmentId, setEnvironmentId] = useState<number | undefined>();

  const { data: projects, isLoading: isProjectsLoading } = useCoolifyConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const { data: projectEnvironments, isLoading: isProjectEnvironmentsLoading } =
    useCoolifyConnectionListProjectEnvironments(connectionId, projectId ?? "", {
      enabled: Boolean(connectionId) && Boolean(projectId)
    });

  const { data: applications, isLoading: isApplicationsLoading } =
    useCoolifyConnectionListApplications(connectionId, environmentId ?? 0, {
      enabled: Boolean(connectionId) && Boolean(environmentId)
    });

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.appId", "");
        }}
      />

      <FormControl label="Project">
        <FilterableSelect
          menuPlacement="top"
          isLoading={isProjectsLoading && Boolean(connectionId)}
          isDisabled={!connectionId}
          value={projects?.find((v) => v.uuid === projectId) ?? null}
          onChange={(option) => setProjectId((option as SingleValue<TCoolifyProject>)?.uuid ?? "")}
          options={projects}
          placeholder="Select a project..."
          getOptionLabel={(option) => option.name}
          getOptionValue={(option) => option.uuid}
        />
      </FormControl>
      <FormControl label="Environment">
        <FilterableSelect
          menuPlacement="top"
          isLoading={isProjectEnvironmentsLoading && Boolean(connectionId) && Boolean(projectId)}
          isDisabled={!connectionId || !projectId}
          value={projectEnvironments?.find((v) => v.id === environmentId) ?? null}
          onChange={(option) =>
            setEnvironmentId((option as SingleValue<TCoolifyProjectEnvironment>)?.id ?? 0)
          }
          options={projectEnvironments}
          placeholder="Select an environment..."
          getOptionLabel={(option) => option.name}
          getOptionValue={(option) => option.uuid}
        />
      </FormControl>
      <Controller
        name="destinationConfig.appId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Application"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the application exists in the connection's Coolify instance URL."
              >
                <div>
                  <span>Don&#39;t see the application you&#39;re looking for?</span>{" "}
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isApplicationsLoading && Boolean(connectionId) && Boolean(environmentId)}
              isDisabled={!connectionId || !environmentId}
              value={applications?.find((v) => v.uuid === value) ?? null}
              onChange={(option) =>
                onChange((option as SingleValue<TCoolifyApplication>)?.uuid ?? null)
              }
              options={applications}
              placeholder="Select an application..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.uuid}
            />
          </FormControl>
        )}
      />
    </>
  );
};
