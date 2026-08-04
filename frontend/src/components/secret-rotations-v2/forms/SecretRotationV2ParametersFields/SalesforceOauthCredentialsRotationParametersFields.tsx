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
import { useSalesforceConnectionListOauthApps } from "@app/hooks/api/appConnections/salesforce";
import { TSalesforceOauthApp } from "@app/hooks/api/appConnections/salesforce/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const SalesforceOauthCredentialsRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SalesforceOauthCredentials;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: apps, isPending: isAppsPending } = useSalesforceConnectionListOauthApps(
    connectionId,
    { enabled: Boolean(connectionId) }
  );

  return (
    <Controller
      name="parameters.appId"
      control={control}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabelWithTooltip htmlFor="salesforce-external-client-app">
            External Client App
          </FieldLabelWithTooltip>
          <FilterableSelect
            inputId="salesforce-external-client-app"
            menuPlacement="top"
            isLoading={isAppsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={apps?.find((app) => app.identifier === value) ?? null}
            onBlur={onBlur}
            onChange={(option) => {
              const selected = option as SingleValue<TSalesforceOauthApp>;
              onChange(selected?.identifier ?? "");
              setValue("parameters.appName", selected?.developerName ?? "", {
                shouldDirty: true,
                shouldValidate: true
              });
            }}
            options={apps}
            placeholder="Select an external client app..."
            getOptionLabel={(option) => option.developerName}
            getOptionValue={(option) => option.identifier}
            isError={Boolean(error)}
            aria-describedby="salesforce-external-client-app-feedback"
          />
          <FieldFeedback
            id="salesforce-external-client-app-feedback"
            description={
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 text-left">
                    <span>Don&#39;t see the app you&#39;re looking for?</span>
                    <InfoIcon className="size-3.5 shrink-0 text-muted" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure that your Salesforce External Client App has OAuth client credentials enabled
                  and is reachable by the connection.
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
