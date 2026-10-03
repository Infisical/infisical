import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@app/components/v3";
import { useFlyioConnectionListApps } from "@app/hooks/api/appConnections/flyio";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const FlyioSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Flyio }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: apps, isLoading: isAppsLoading } = useFlyioConnectionListApps(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.appId", "");
        }}
      />

      <Controller
        name="destinationConfig.appId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel id="secret-sync-flyio-app-id-label" htmlFor="secret-sync-flyio-app-id">
              App
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-flyio-app-id-label"
                aria-describedby={error ? "secret-sync-flyio-app-id-error" : undefined}
                id="secret-sync-flyio-app-id"
                isError={Boolean(error)}
                isLoading={isAppsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={apps?.find((v) => v.id === value) ?? null}
                onValueChange={(option) => {
                  const selected = option;
                  onChange(selected?.id ?? null);
                }}
                options={apps}
                placeholder="Select an app..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldError id="secret-sync-flyio-app-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
