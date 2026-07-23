import { Controller, useFormContext, useWatch } from "react-hook-form";
import { AxiosError } from "axios";
import { Info, Loader2Icon } from "lucide-react";

import {
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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

          const combinedError =
            error ??
            (clusterFetchErrorText
              ? { type: "manual", message: clusterFetchErrorText }
              : undefined);

          return (
            <Field className="mb-4">
              <FieldLabel>
                Target Cluster
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The Nutanix cluster that will receive the certificate.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              {connectionId && isLoadingClusters ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted">
                  <Loader2Icon className="size-4 animate-spin" />
                  Loading clusters...
                </div>
              ) : (
                <Select
                  value={value ?? ""}
                  onValueChange={(newValue) => {
                    const cluster = clusters?.find((c) => c.id === newValue);
                    onChange(newValue);
                    setValue("destinationConfig.clusterName", cluster?.name ?? "");
                  }}
                  disabled={!connectionId || isLoadingClusters}
                >
                  <SelectTrigger className="w-full" isError={Boolean(combinedError)}>
                    <SelectValue
                      placeholder={connectionId ? "Select a cluster" : "Select a connection first"}
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(clusters ?? []).map((cluster) => (
                      <SelectItem key={cluster.id} value={cluster.id}>
                        {cluster.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FieldError errors={[combinedError]} />
            </Field>
          );
        }}
      />
    </>
  );
};
