import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { InfoIcon } from "lucide-react";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import {
  Field,
  FieldFeedback,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useDatabricksConnectionListServicePrincipals } from "@app/hooks/api/appConnections/databricks";
import { TDatabricksServicePrincipal } from "@app/hooks/api/appConnections/databricks/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const DatabricksServicePrincipalSecretRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DatabricksServicePrincipalSecret;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: servicePrincipals, isPending: isServicePrincipalsPending } =
    useDatabricksConnectionListServicePrincipals(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <Controller
      name="parameters.servicePrincipalId"
      control={control}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabelWithTooltip htmlFor="databricks-service-principal">
            Service Principal
          </FieldLabelWithTooltip>
          <FilterableSelect
            inputId="databricks-service-principal"
            menuPlacement="top"
            isLoading={isServicePrincipalsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={servicePrincipals?.find((sp) => sp.id === value) ?? null}
            onBlur={onBlur}
            onChange={(option) => {
              const selectedSp = option as SingleValue<TDatabricksServicePrincipal>;
              onChange(selectedSp?.id ?? null);
              setValue("parameters.servicePrincipalName", selectedSp?.name ?? "");
              setValue("parameters.clientId", selectedSp?.clientId ?? "");
            }}
            options={servicePrincipals}
            placeholder="Select a service principal..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.id}
            isError={Boolean(error)}
            aria-describedby="databricks-service-principal-feedback"
          />
          <FieldFeedback
            id="databricks-service-principal-feedback"
            description={
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 text-left">
                    <span>Don&#39;t see the service principal you&#39;re looking for?</span>
                    <InfoIcon className="size-3.5 shrink-0 text-muted" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure that your connection has the necessary permissions to list and manage
                  service principals in your Databricks workspace.
                </TooltipContent>
              </Tooltip>
            }
            error={error?.message}
          />
        </Field>
      )}
    />
  );
};
