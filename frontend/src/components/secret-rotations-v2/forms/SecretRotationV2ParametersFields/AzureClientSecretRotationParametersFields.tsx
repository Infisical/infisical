import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import {
  Combobox,
  Field,
  FieldFeedback,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useAzureConnectionListClients } from "@app/hooks/api/appConnections/azure";
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
          <Combobox
            id="azure-application"
            isLoading={isClientsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={clients?.find((client) => client.id === value) ?? null}
            onBlur={onBlur}
            onValueChange={(option) => {
              onChange(option.id);
              setValue("parameters.appName", option.name);
              setValue("parameters.clientId", option.appId);
            }}
            isClearable={false}
            options={clients}
            placeholder="Select an application..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.id}
            getOptionKeywords={(option) => [option.id]}
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
                    <InfoIcon className="size-3 shrink-0 text-muted" />
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
