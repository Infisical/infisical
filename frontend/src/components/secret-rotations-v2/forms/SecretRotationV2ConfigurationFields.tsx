import { Controller, useFormContext } from "react-hook-form";
import { format, setHours, setMinutes } from "date-fns";

import { FilterableSelect, FormControl, Input, Switch } from "@app/components/v2";
import { getRotateAtLocal } from "@app/helpers/secretRotationsV2";
import { WorkspaceEnv } from "@app/hooks/api/workspace/types";

import { TSecretRotationV2Form } from "./schemas";
import { SecretRotationV2ConnectionField } from "./SecretRotationV2ConnectionField";

type Props = {
  isUpdate: boolean;
  environments?: WorkspaceEnv[];
};

export const SecretRotationV2ConfigurationFields = ({ isUpdate, environments }: Props) => {
  const { control, watch } = useFormContext<TSecretRotationV2Form>();

  console.log(watch("rotateAtUtc"));

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Configure the connection rotation strategy for this Secret Rotation.
      </p>
      {!isUpdate && environments && (
        <Controller
          control={control}
          name="environment"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl label="Environment" isError={Boolean(error)} errorText={error?.message}>
              <FilterableSelect
                value={value}
                onChange={onChange}
                options={environments}
                placeholder="Select an environment..."
                getOptionLabel={(option) => option?.name}
                getOptionValue={(option) => option?.id}
              />
            </FormControl>
          )}
        />
      )}

      <SecretRotationV2ConnectionField isUpdate={isUpdate} />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Rotation Interval (In Days)"
          >
            <Input
              value={value}
              type="number"
              onChange={onChange}
              min={1}
              placeholder="my-secret-rotation"
            />
          </FormControl>
        )}
        control={control}
        name="rotationInterval"
      />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          return (
            <FormControl
              label="Rotate At (Local Time)"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                type="time"
                value={format(getRotateAtLocal(value), "HH:mm")}
                onChange={(e) => {
                  const time = e.target.value;
                  if (time) {
                    const [hours, minutes] = time.split(":").map((str) => parseInt(str, 10));
                    const newSelectedDate = setHours(setMinutes(new Date(), minutes), hours);
                    onChange({
                      hours: newSelectedDate.getUTCHours(),
                      minutes: newSelectedDate.getUTCMinutes()
                    });
                  }
                }}
                className="bg-mineshaft-700 text-white [color-scheme:dark]"
              />
            </FormControl>
          );
        }}
        control={control}
        name="rotateAtUtc"
      />
      <Controller
        control={control}
        name="isAutoRotationEnabled"
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          return (
            <FormControl
              helperText={
                value
                  ? "Secrets will automatically be rotated when the rotation interval specified above as elapsed."
                  : "Secrets will not be rotated automatically. You can still rotate secrets manually."
              }
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Switch
                className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                id="auto-rotation-enabled"
                thumbClassName="bg-mineshaft-800"
                onCheckedChange={onChange}
                isChecked={value}
              >
                <p className="w-[9.6rem]">Auto-Rotation {value ? "Enabled" : "Disabled"}</p>
              </Switch>
            </FormControl>
          );
        }}
      />
    </>
  );
};
