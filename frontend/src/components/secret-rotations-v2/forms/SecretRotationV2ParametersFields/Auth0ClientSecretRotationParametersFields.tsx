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
import { useAuth0ConnectionListClients } from "@app/hooks/api/appConnections/auth0";
import { TAuth0Client } from "@app/hooks/api/appConnections/auth0/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const Auth0ClientSecretRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.Auth0ClientSecret;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: clients, isPending: isClientsPending } = useAuth0ConnectionListClients(
    connectionId,
    { enabled: Boolean(connectionId) }
  );

  return (
    <Controller
      name="parameters.clientId"
      control={control}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabelWithTooltip htmlFor="auth0-application">Application</FieldLabelWithTooltip>
          <FilterableSelect
            inputId="auth0-application"
            isLoading={isClientsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={clients?.find((client) => client.id === value) ?? null}
            onBlur={onBlur}
            onChange={(option) => {
              onChange((option as SingleValue<TAuth0Client>)?.id ?? null);
            }}
            options={clients}
            placeholder="Select an application..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.id}
            isError={Boolean(error)}
            aria-describedby="auth0-application-feedback"
          />
          <FieldFeedback
            id="auth0-application-feedback"
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
                  <span className="font-medium">read_clients</span> permission and the application
                  exists in the connection&#39;s audience.
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
