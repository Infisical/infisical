import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldError, FieldLegend, FieldSet, Input } from "@app/components/v3";

import { DEFAULT_PASSWORD_REQUIREMENTS, TPasswordRequirements } from "../../schemas/shared";

type Props = {
  defaultRequirements?: Omit<TPasswordRequirements, "allowedSymbols"> & {
    allowedSymbols?: string;
  };
};

export const PasswordRequirementsFields = ({
  defaultRequirements = DEFAULT_PASSWORD_REQUIREMENTS
}: Props) => {
  const { control } = useFormContext<TSecretRotationV2Form>();

  return (
    <FieldSet className="gap-3">
      <FieldLegend variant="label" className="mb-0">
        Password Requirements
      </FieldLegend>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Controller
          control={control}
          name="parameters.passwordRequirements.length"
          defaultValue={defaultRequirements.length}
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip tooltip="The length of the password to generate">
                Password Length
              </FieldLabelWithTooltip>
              <Input
                type="number"
                min={1}
                max={250}
                {...field}
                isError={Boolean(error)}
                onChange={(event) => field.onChange(Number(event.target.value))}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="parameters.passwordRequirements.required.digits"
          defaultValue={defaultRequirements.required.digits}
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip tooltip="Minimum number of digits">
                Digit Count
              </FieldLabelWithTooltip>
              <Input
                type="number"
                min={0}
                {...field}
                isError={Boolean(error)}
                onChange={(event) => field.onChange(Number(event.target.value))}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="parameters.passwordRequirements.required.lowercase"
          defaultValue={defaultRequirements.required.lowercase}
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip tooltip="Minimum number of lowercase characters">
                Lowercase Character Count
              </FieldLabelWithTooltip>
              <Input
                type="number"
                min={0}
                {...field}
                isError={Boolean(error)}
                onChange={(event) => field.onChange(Number(event.target.value))}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="parameters.passwordRequirements.required.uppercase"
          defaultValue={defaultRequirements.required.uppercase}
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip tooltip="Minimum number of uppercase characters">
                Uppercase Character Count
              </FieldLabelWithTooltip>
              <Input
                type="number"
                min={0}
                {...field}
                isError={Boolean(error)}
                onChange={(event) => field.onChange(Number(event.target.value))}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="parameters.passwordRequirements.required.symbols"
          defaultValue={defaultRequirements.required.symbols}
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip tooltip="Minimum number of symbols">
                Symbol Count
              </FieldLabelWithTooltip>
              <Input
                type="number"
                min={0}
                {...field}
                isError={Boolean(error)}
                onChange={(event) => field.onChange(Number(event.target.value))}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="parameters.passwordRequirements.allowedSymbols"
          defaultValue={defaultRequirements.allowedSymbols}
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip tooltip="Symbols to use in generated password">
                Allowed Symbols
              </FieldLabelWithTooltip>
              <Input placeholder="-_.~!*" {...field} isError={Boolean(error)} />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
      </div>
    </FieldSet>
  );
};
