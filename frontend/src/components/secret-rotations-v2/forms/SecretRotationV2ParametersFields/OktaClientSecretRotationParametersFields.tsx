import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FilterableSelect, FormControl } from "@app/components/v2";
import { useOktaConnectionListApps } from "@app/hooks/api/appConnections/okta";
import { TOktaApp } from "@app/hooks/api/appConnections/okta/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const OktaClientSecretRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.OktaClientSecret;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: apps, isPending: isAppsPending } = useOktaConnectionListApps(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <Controller
      name="parameters.clientId"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl
          isError={Boolean(error)}
          errorText={error?.message}
          label="OpenID Connect Application"
        >
          <FilterableSelect
            menuPlacement="top"
            isLoading={isAppsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={apps?.find((app) => app.id === value) ?? null}
            onChange={(option) => {
              onChange((option as SingleValue<TOktaApp>)?.id ?? null);
              setValue("parameters.clientId", (option as SingleValue<TOktaApp>)?.id ?? "");
            }}
            options={apps}
            placeholder="Select an application..."
            getOptionLabel={(option) => option.label}
            getOptionValue={(option) => option.id}
          />
        </FormControl>
      )}
    />
  );
};
