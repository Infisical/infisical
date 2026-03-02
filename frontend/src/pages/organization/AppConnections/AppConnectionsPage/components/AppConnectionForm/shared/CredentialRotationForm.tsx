import { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { format, setHours, setMinutes } from "date-fns";
import { twMerge } from "tailwind-merge";

import { FormControl, Input, Switch } from "@app/components/v2";
import { getRotateAtLocal } from "@app/helpers/secretRotationsV2";

type Props = {
  renderExtraFields?: ReactNode;
};

export const CredentialRotationForm = ({ renderExtraFields }: Props) => {
  const { control, watch } = useFormContext();

  const isAutoRotationEnabled = watch("isAutoRotationEnabled");
  return (
    <div>
      <div className={twMerge(isAutoRotationEnabled && "mb-4", "mt-5")}>
        <Controller
          name="isAutoRotationEnabled"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              helperText={
                value
                  ? "App connection credentials will automatically be rotated when the rotation interval specified above as elapsed."
                  : "App connection credentials will not be rotated automatically."
              }
              isError={Boolean(error?.message)}
              errorText={error?.message}
            >
              <Switch
                className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                id="platform-managed"
                thumbClassName="bg-mineshaft-800"
                isChecked={value}
                onCheckedChange={onChange}
              >
                <p className="w-[13.6rem]">Automatic Credential Rotation</p>
              </Switch>
            </FormControl>
          )}
        />
      </div>

      {isAutoRotationEnabled && (
        <>
          {renderExtraFields}
          <div className="flex w-full items-center gap-2">
            <Controller
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  className="flex-1"
                  tooltipText="How often Infisical will rotate the credentials of this connection."
                  isError={Boolean(error)}
                  errorText={error?.message}
                  label="Rotation Interval (In Days)"
                >
                  <Input
                    value={value}
                    type="number"
                    onChange={(e) => onChange(parseInt(e.target.value, 10))}
                    min={1}
                    placeholder="30"
                  />
                </FormControl>
              )}
              control={control}
              name="rotation.rotationInterval"
            />
            <Controller
              render={({ field: { value, onChange }, fieldState: { error } }) => {
                return (
                  <FormControl
                    className="flex-1"
                    tooltipText="The time of day at which Infisical will rotate the credentials of this connection."
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
                      className="bg-mineshaft-700 text-white scheme-dark"
                    />
                  </FormControl>
                );
              }}
              control={control}
              name="rotation.rotateAtUtc"
            />
          </div>
        </>
      )}
    </div>
  );
};
