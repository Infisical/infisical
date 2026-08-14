import { Controller, useFormContext } from "react-hook-form";
import { format, setHours, setMinutes } from "date-fns";
import { TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Field,
  FieldContent,
  FieldError,
  FieldFeedback,
  FieldLabel,
  FilterableSelect,
  Input,
  Label,
  Switch
} from "@app/components/v3";
import {
  getRotateAtLocal,
  IS_ROTATION_DUAL_CREDENTIALS,
  SECRET_ROTATION_MAP
} from "@app/helpers/secretRotationsV2";
import { ProjectEnv } from "@app/hooks/api/projects/types";

import { TSecretRotationV2Form } from "./schemas";
import { SecretRotationV2ConnectionField } from "./SecretRotationV2ConnectionField";

type Props = {
  isUpdate: boolean;
  environments?: ProjectEnv[];
};

export const SecretRotationV2ConfigurationFields = ({ isUpdate, environments }: Props) => {
  const { control, watch } = useFormContext<TSecretRotationV2Form>();

  const [type, isAutoRotationEnabled] = watch(["type", "isAutoRotationEnabled"]);

  return (
    <div className="space-y-4">
      {!isUpdate && environments && (
        <Controller
          control={control}
          name="environment"
          render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="secret-rotation-environment">Environment</FieldLabel>
              <FilterableSelect
                inputId="secret-rotation-environment"
                value={value ?? null}
                onBlur={onBlur}
                onChange={onChange}
                options={environments}
                placeholder="Select an environment..."
                getOptionLabel={(option) => option?.name}
                getOptionValue={(option) => option?.id}
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
      )}

      <SecretRotationV2ConnectionField isUpdate={isUpdate} />
      <Controller
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="secret-rotation-interval">Rotation Interval (In Days)</FieldLabel>
            <Input
              ref={ref}
              id="secret-rotation-interval"
              value={value}
              type="number"
              onBlur={onBlur}
              onChange={onChange}
              min={1}
              placeholder="30"
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="rotationInterval"
      />
      <Controller
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => {
          return (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="secret-rotation-rotate-at">Rotate At (Local Time)</FieldLabel>
              <Input
                ref={ref}
                id="secret-rotation-rotate-at"
                type="time"
                value={format(getRotateAtLocal(value), "HH:mm")}
                onBlur={onBlur}
                onChange={(e) => {
                  const time = e.target.value;
                  if (!time) return;
                  const [hours, minutes] = time.split(":").map((str) => parseInt(str, 10));
                  const newSelectedDate = setHours(setMinutes(new Date(), minutes), hours);
                  const next = {
                    hours: newSelectedDate.getUTCHours(),
                    minutes: newSelectedDate.getUTCMinutes()
                  };
                  // Avoid mount/normalization writes that round-trip to the same UTC time.
                  if (next.hours === value.hours && next.minutes === value.minutes) return;
                  onChange(next);
                }}
                className="scheme-dark [&::-webkit-calendar-picker-indicator]:hidden"
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          );
        }}
        control={control}
        name="rotateAtUtc"
      />
      <Controller
        control={control}
        name="isAutoRotationEnabled"
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => {
          return (
            <Field data-invalid={Boolean(error)} orientation="horizontal">
              <FieldContent>
                <Label htmlFor="auto-rotation-enabled">
                  Auto-Rotation {value ? "Enabled" : "Disabled"}
                </Label>
                <FieldFeedback
                  id="auto-rotation-enabled-feedback"
                  description={
                    value
                      ? "Secrets will automatically be rotated when the rotation interval specified above has elapsed."
                      : "Secrets will not be rotated automatically. You can still rotate secrets manually."
                  }
                  error={error?.message}
                />
              </FieldContent>
              <Switch
                ref={ref}
                id="auto-rotation-enabled"
                variant="project"
                checked={value}
                onBlur={onBlur}
                onCheckedChange={onChange}
                aria-invalid={Boolean(error)}
                aria-describedby="auto-rotation-enabled-feedback"
              />
            </Field>
          );
        }}
      />
      {!IS_ROTATION_DUAL_CREDENTIALS[type] && isAutoRotationEnabled && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            Due to {SECRET_ROTATION_MAP[type].name} Rotations rotating a single credential set,
            auto-rotation may result in service interruptions. If you need to ensure service
            continuity, we recommend disabling this option.{" "}
            <a
              href="https://infisical.com/docs/documentation/platform/secret-rotation/overview#how-rotation-works"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Read more
            </a>
            .
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
