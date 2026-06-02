import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { TFlyioApp, useFlyioConnectionListApps } from "@app/hooks/api/appConnections/flyio";
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
            <FieldLabel>App</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isAppsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={apps?.find((v) => v.id === value) ?? null}
                onChange={(option) => {
                  const selected = option as SingleValue<TFlyioApp>;
                  onChange(selected?.id ?? null);
                }}
                options={apps}
                placeholder="Select an app..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
