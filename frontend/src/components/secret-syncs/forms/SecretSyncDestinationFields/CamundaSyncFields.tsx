import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useCamundaConnectionListClusters } from "@app/hooks/api/appConnections/camunda";
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
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.clusterUUID", "");
        }}
      />
      <Controller
        name="destinationConfig.clusterUUID"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-camunda-cluster-uuid-label"
              htmlFor="secret-sync-camunda-cluster-uuid"
            >
              Cluster
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure that your credential has been granted access to the cluster.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-camunda-cluster-uuid-label"
                aria-describedby={error ? "secret-sync-camunda-cluster-uuid-error" : undefined}
                id="secret-sync-camunda-cluster-uuid"
                isError={Boolean(error)}
                isLoading={isPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={clusters?.find((cluster) => cluster.uuid === value) ?? null}
                onValueChange={(option) => {
                  onChange(option.uuid ?? null);
                  setValue("destinationConfig.clusterName", option.name ?? "");
                }}
                options={clusters}
                placeholder="Select a cluster..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.uuid}
                getOptionKeywords={(option) => [option.uuid]}
                modal
              />
              <FieldError id="secret-sync-camunda-cluster-uuid-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
