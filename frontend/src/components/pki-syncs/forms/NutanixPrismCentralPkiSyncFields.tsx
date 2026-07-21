import { Controller, useFormContext, useWatch } from "react-hook-form";
import { AxiosError } from "axios";

import { FormControl, Select, SelectItem, Spinner } from "@app/components/v2";
import { useNutanixPrismCentralConnectionListClusters } from "@app/hooks/api/appConnections/nutanix-prism-central";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

type TNutanixForm = TPkiSyncForm & { destination: PkiSync.NutanixPrismCentral };

export const NutanixPrismCentralPkiSyncFields = () => {
  const { control, setValue } = useFormContext<TNutanixForm>();

  const connectionId = useWatch({ name: "connection.id", control });

  const {
    data: clusters,
    isFetching: isLoadingClusters,
    isError: isClustersError,
    error: clustersError
  } = useNutanixPrismCentralConnectionListClusters(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.clusterId", "");
          setValue("destinationConfig.clusterName", "");
        }}
      />
      <Controller
        name="destinationConfig.clusterId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          const clusterFetchErrorText =
            isClustersError && connectionId
              ? ((clustersError as AxiosError<{ message?: string }>)?.response?.data?.message ??
                "Failed to fetch clusters. Check connection settings.")
              : undefined;

          return (
            <FormControl
              isError={Boolean(error) || Boolean(clusterFetchErrorText)}
              errorText={error?.message ?? clusterFetchErrorText}
              label="Target Cluster"
              tooltipText="The Nutanix cluster that will receive the certificate."
            >
              {connectionId && isLoadingClusters ? (
                <div className="flex items-center gap-2 py-2 text-sm text-mineshaft-400">
                  <Spinner size="sm" />
                  Loading clusters...
                </div>
              ) : (
                <Select
                  value={value}
                  onValueChange={(newValue) => {
                    const cluster = clusters?.find((c) => c.id === newValue);
                    onChange(newValue);
                    setValue("destinationConfig.clusterName", cluster?.name ?? "");
                  }}
                  placeholder={connectionId ? "Select a cluster" : "Select a connection first"}
                  isDisabled={!connectionId || isLoadingClusters}
                  className="w-full"
                  position="popper"
                  dropdownContainerClassName="max-w-none"
                >
                  {(clusters ?? []).map((cluster) => (
                    <SelectItem key={cluster.id} value={cluster.id}>
                      {cluster.name}
                    </SelectItem>
                  ))}
                </Select>
              )}
            </FormControl>
          );
        }}
      />
    </>
  );
};
