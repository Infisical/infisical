import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import { useGetAzureDevOpsProjects } from "@app/hooks/api/appConnections/azure";
import { AzureDevOpsProject } from "@app/hooks/api/appConnections/azure/types";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const AzureDevOpsSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureDevOps }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: { projects } = { projects: [] }, isLoading: isProjectsLoading } =
    useGetAzureDevOpsProjects(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.devopsProjectId", "");
        }}
      />

      <Controller
        name="destinationConfig.devopsProjectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Project"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the project exists in the connection's Azure DevOps instance URL."
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
              value={projects?.find((v) => v.appId === value) ?? null}
              onChange={(option) => {
                onChange((option as SingleValue<AzureDevOpsProject>)?.appId ?? null);
                setValue(
                  "destinationConfig.devopsProjectName",
                  (option as SingleValue<AzureDevOpsProject>)?.name ?? ""
                );
              }}
              options={projects}
              placeholder="Select a project..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
    </>
  );
};
