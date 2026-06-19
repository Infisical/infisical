import { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { format, setHours, setMinutes } from "date-fns";
import { Info } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getRotateAtLocal } from "@app/helpers/secretRotationsV2";
import { useScopeVariant } from "@app/hooks";

type Props = {
  children?: ReactNode;
};

export const CredentialRotationForm = ({ children }: Props) => {
  const { control, watch } = useFormContext();
  const scopeVariant = useScopeVariant();

  const isAutoRotationEnabled = watch("isAutoRotationEnabled");
  return (
    <div>
      <div className={twMerge(isAutoRotationEnabled && "mb-4", "mt-5")}>
        <Controller
          name="isAutoRotationEnabled"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="auto-rotation-enabled">Automatic Credential Rotation</Label>
                  <FieldDescription>
                    {value
                      ? "App connection credentials will automatically be rotated when the rotation interval specified above as elapsed."
                      : "App connection credentials will not be rotated automatically."}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="auto-rotation-enabled"
                  variant={scopeVariant}
                  checked={value}
                  onCheckedChange={onChange}
                />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      </div>

      {isAutoRotationEnabled && (
        <>
          {children}
          <div className="flex w-full items-start gap-2">
            <Controller
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel>
                    Rotation Interval (In Days)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        How often Infisical will rotate the credentials of this connection.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    value={value}
                    type="number"
                    onChange={(e) => onChange(parseInt(e.target.value, 10))}
                    min={1}
                    placeholder="30"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
              control={control}
              name="rotation.rotationInterval"
            />
            <Controller
              render={({ field: { value, onChange }, fieldState: { error } }) => {
                return (
                  <Field className="flex-1">
                    <FieldLabel>
                      Rotate At (Local Time)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          The time of day at which Infisical will rotate the credentials of this
                          connection.
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
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
                      className="scheme-dark"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
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
