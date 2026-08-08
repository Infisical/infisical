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
import { useAzureConnectionListClients } from "@app/hooks/api/appConnections/azure";
import { TAzureClient } from "@app/hooks/api/appConnections/azure/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const AzureClientSecretRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.AzureClientSecret;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: clients, isPending: isClientsPending } = useAzureConnectionListClients(
    connectionId,
    { enabled: Boolean(connectionId) }
  );

  return (
    <Controller
      name="parameters.objectId"
      control={control}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabelWithTooltip htmlFor="azure-application">Application</FieldLabelWithTooltip>
          <FilterableSelect
            inputId="azure-application"
            menuPlacement="top"
            isLoading={isClientsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={clients?.find((client) => client.id === value) ?? null}
            onBlur={onBlur}
            onChange={(option) => {
              onChange((option as SingleValue<TAzureClient>)?.id ?? null);
              setValue("parameters.appName", (option as SingleValue<TAzureClient>)?.name ?? "");
              setValue("parameters.clientId", (option as SingleValue<TAzureClient>)?.appId ?? "");
            }}
            options={clients}
            placeholder="Select an application..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.id}
            isError={Boolean(error)}
            aria-describedby="azure-application-feedback"
          />
          <FieldFeedback
            id="azure-application-feedback"
            description={
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 text-left">
                    <span>Don&#39;t see the application you&#39;re looking for?</span>
                    <InfoIcon className="size-3.5 shrink-0 text-muted" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure that your connection has the{" "}
                  <span className="font-medium">
                    Application.ReadWrite.All, Directory.ReadWrite.All,
                    Application.ReadWrite.OwnedBy, user_impersonation and User.Read
                  </span>{" "}
                  permissions and the application exists in Azure.
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
