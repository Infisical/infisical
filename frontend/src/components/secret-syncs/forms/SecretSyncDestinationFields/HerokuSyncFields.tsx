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
import { useHerokuConnectionListApps } from "@app/hooks/api/appConnections/heroku/queries";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const HerokuSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Heroku }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: apps, isLoading: isAppsLoading } = useHerokuConnectionListApps(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.app", "");
          setValue("destinationConfig.appName", "");
        }}
      />

      <Controller
        name="destinationConfig.app"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              App
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure the app exists in the connection&apos;s Heroku instance URL.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Combobox
                isLoading={isAppsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={apps?.find((app) => app.id === value) ?? null}
                onValueChange={(option) => {
                  onChange(option.id ?? "");
                  setValue("destinationConfig.appName", option.name ?? "");
                }}
                options={apps}
                placeholder="Select an app..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                modal
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
