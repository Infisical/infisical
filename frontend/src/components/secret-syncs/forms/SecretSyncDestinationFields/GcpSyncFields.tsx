import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import { useGcpConnectionListProjects } from "@app/hooks/api/appConnections/gcp/queries";
import { TGitHubConnectionEnvironment } from "@app/hooks/api/appConnections/github";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GcpSyncScope } from "@app/hooks/api/secretSyncs/types/gcp-sync";

import { TSecretSyncForm } from "../schemas";

export const GcpSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.GCPSecretManager }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: projects, isPending } = useGcpConnectionListProjects(connectionId, {
    enabled: Boolean(connectionId)
  });

  useEffect(() => {
    setValue("destinationConfig.scope", GcpSyncScope.Global);
  }, []);

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
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
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure that you've enabled the Secret Manager API and Cloud Resource Manager API on your GCP project. Additionally, make sure that the service account is assigned the appropriate GCP roles."
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
              isLoading={isPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={projects?.find((project) => project.id === value) ?? null}
              onChange={(option) =>
                onChange((option as SingleValue<TGitHubConnectionEnvironment>)?.id ?? null)
              }
              options={projects}
              placeholder="Select a GCP project..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id.toString()}
            />
          </FormControl>
        )}
      />
    </>
  );
};
