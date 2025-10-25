import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import {
  TNorthflankProject,
  TNorthflankSecretGroup,
  useNorthflankConnectionListProjects,
  useNorthflankConnectionListSecretGroups
} from "@app/hooks/api/appConnections/northflank";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const NorthflankSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Northflank }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });

  const { data: projects = [], isPending: isProjectsLoading } = useNorthflankConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const { data: secretGroups = [], isPending: isSecretGroupsLoading } =
    useNorthflankConnectionListSecretGroups(connectionId, projectId, {
      enabled: Boolean(connectionId) && Boolean(projectId)
    });

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.secretGroupId", "");
          setValue("destinationConfig.secretGroupName", "");
        }}
      />
      <Controller
        name="destinationConfig.projectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Project"
            isRequired
            helperText={
              <Tooltip content="Ensure the project exists in the connection's Northflank team and the connection has access to it.">
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
              value={projects.find((p) => p.id === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TNorthflankProject>;
                onChange(v?.id ?? null);
                setValue("destinationConfig.projectName", v?.name ?? "");
                setValue("destinationConfig.secretGroupId", "");
                setValue("destinationConfig.secretGroupName", "");
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
        name="destinationConfig.secretGroupId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Secret Group"
            isRequired
            helperText={
              <Tooltip content="Ensure the secret group exists in the connection's Northflank project and the connection has access to it.">
                <div>
                  <span>Don&#39;t see the secret group you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              isLoading={isSecretGroupsLoading && Boolean(projectId)}
              isDisabled={!projectId}
              value={secretGroups.find((sg) => sg.id === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TNorthflankSecretGroup>;
                onChange(v?.id ?? null);
                setValue("destinationConfig.secretGroupName", v?.name ?? "");
              }}
              options={secretGroups}
              placeholder="Select a secret group..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
    </>
  );
};
