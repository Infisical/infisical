import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { parseDynamicSecretProviderNumberInput } from "../scalarValues";
import { defineDynamicSecretProvider } from "../types";
import {
  getTotpCreateDefaultValues,
  getTotpCreatePayload,
  getTotpEditDefaultValues,
  getTotpEditPayload,
  TOTP_CUSTOM_RENDERER_REASONS,
  TotpAlgorithm,
  TotpConfigType,
  totpCreateFormSchema,
  totpEditFormSchema,
  TTotpFormValues
} from "./totpContract";

const TotpFields = () => {
  const { control, watch } = useFormContext<TTotpFormValues>();
  const configType = watch("inputs.configType");

  return (
    <DynamicSecretProviderGroup id="totp-configuration" presentation="panel">
      <Controller
        control={control}
        name="inputs.configType"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="totp-config-type">Configuration Type</FieldLabel>
            <Select
              value={field.value}
              onValueChange={(value) => {
                if (!value || value === field.value) return;
                field.onChange(value);
              }}
            >
              <SelectTrigger
                ref={field.ref}
                id="totp-config-type"
                onBlur={field.onBlur}
                isError={Boolean(error)}
                aria-describedby={error ? "totp-config-type-error" : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TotpConfigType.URL}>URL</SelectItem>
                <SelectItem value={TotpConfigType.MANUAL}>Manual</SelectItem>
              </SelectContent>
            </Select>
            <FieldError id="totp-config-type-error">{error?.message}</FieldError>
          </Field>
        )}
      />

      {configType === TotpConfigType.URL && (
        <Controller
          control={control}
          name="inputs.url"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="totp-url">OTP URL</FieldLabel>
              <Input
                {...field}
                id="totp-url"
                type="password"
                autoComplete="new-password"
                placeholder="otpauth://"
                isError={Boolean(error)}
                aria-describedby={error ? "totp-url-error" : undefined}
              />
              <FieldError id="totp-url-error">{error?.message}</FieldError>
            </Field>
          )}
        />
      )}

      {configType === TotpConfigType.MANUAL && (
        <>
          <Controller
            control={control}
            name="inputs.secret"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="totp-secret">Secret Key</FieldLabel>
                <Input
                  {...field}
                  id="totp-secret"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter Base32 secret key"
                  isError={Boolean(error)}
                  aria-describedby={error ? "totp-secret-error" : undefined}
                />
                <FieldError id="totp-secret-error">{error?.message}</FieldError>
              </Field>
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Controller
              control={control}
              name="inputs.period"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="totp-period">Period</FieldLabel>
                  <Input
                    {...field}
                    id="totp-period"
                    type="number"
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.onChange(parseDynamicSecretProviderNumberInput(event.target.value))
                    }
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="inputs.digits"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="totp-digits">Digits</FieldLabel>
                  <Input
                    {...field}
                    id="totp-digits"
                    type="number"
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.onChange(parseDynamicSecretProviderNumberInput(event.target.value))
                    }
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="inputs.algorithm"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="totp-algorithm">Algorithm</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      if (!value || value === field.value) return;
                      field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      ref={field.ref}
                      id="totp-algorithm"
                      onBlur={field.onBlur}
                      isError={Boolean(error)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TotpAlgorithm.SHA1}>SHA1</SelectItem>
                      <SelectItem value={TotpAlgorithm.SHA256}>SHA256</SelectItem>
                      <SelectItem value={TotpAlgorithm.SHA512}>SHA512</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          </div>
          <FieldDescription>
            The period, digits, and algorithm values can remain at their defaults unless your TOTP
            provider specifies otherwise.
          </FieldDescription>
        </>
      )}
    </DynamicSecretProviderGroup>
  );
};

export const totpDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Totp,
  label: "TOTP",
  customRenderer: {
    reasons: TOTP_CUSTOM_RENDERER_REASONS,
    Component: TotpFields
  },
  create: {
    schema: totpCreateFormSchema,
    getDefaultValues: getTotpCreateDefaultValues,
    toPayload: getTotpCreatePayload,
    commonFields: {
      defaultTTL: { isVisible: false },
      maxTTL: { isVisible: false }
    },
    submitLabel: "Submit"
  },
  edit: {
    schema: totpEditFormSchema,
    getDefaultValues: getTotpEditDefaultValues,
    toPayload: getTotpEditPayload,
    commonFields: {
      defaultTTL: { isVisible: false },
      maxTTL: { isVisible: false }
    },
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
