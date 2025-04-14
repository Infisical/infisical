import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
import { useCamundaConnectionListClusters } from "@app/hooks/api/appConnections/camunda";
import { TCamundaCluster } from "@app/hooks/api/appConnections/camunda/types";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CamundaSyncScope } from "@app/hooks/api/secretSyncs/types/camunda-sync";

import { TSecretSyncForm } from "../schemas";

export const CamundaSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Camunda }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: clusters, isPending } = useCamundaConnectionListClusters(connectionId, {
    enabled: Boolean(connectionId)
  });

  useEffect(() => {
    setValue("destinationConfig.scope", CamundaSyncScope.Cluster);
  }, []);

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.clusterUUID", "");
        }}
      />
      <Controller
        name="destinationConfig.clusterUUID"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Cluster"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure that your credential has been granted access to the cluster"
              >
                <div>
                  <span>Don&#39;t see the cluster you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={clusters?.find((cluster) => cluster.uuid === value) ?? null}
              onChange={(option) => {
                onChange((option as SingleValue<TCamundaCluster>)?.uuid ?? null);
                setValue(
                  "destinationConfig.clusterName",
                  (option as SingleValue<TCamundaCluster>)?.name ?? ""
                );
              }}
              options={clusters}
              placeholder="Select a cluster..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.uuid}
            />
          </FormControl>
        )}
      />
    </>
  );
};
