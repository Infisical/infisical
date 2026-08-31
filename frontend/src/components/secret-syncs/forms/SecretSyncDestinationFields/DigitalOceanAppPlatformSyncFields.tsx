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
import { useDigitalOceanConnectionListApps } from "@app/hooks/api/appConnections/digital-ocean";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const DigitalOceanAppPlatformSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.DigitalOceanAppPlatform }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: apps = [], isPending: isAccountsLoading } = useDigitalOceanConnectionListApps(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.appId", "");
          setValue("destinationConfig.appName", "");
        }}
      />
      <Controller
        name="destinationConfig.appId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Select an app</FieldLabel>
            <FieldContent>
              <Combobox
                isLoading={isAccountsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={apps.find((p) => p.id === value) ?? null}
                onValueChange={(option) => {
                  const v = option;
                  onChange(v?.id ?? null);
                  setValue("destinationConfig.appName", v?.spec.name ?? "");
                }}
                options={apps}
                placeholder="Select an app..."
                getOptionLabel={(option) => option.spec.name}
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
