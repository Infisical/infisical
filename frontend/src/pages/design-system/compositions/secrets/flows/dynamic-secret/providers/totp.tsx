import { Controller, useFormContext } from "react-hook-form";

import {
  getTotpCreateDefaultValues,
  getTotpCreatePayload,
  TotpAlgorithm,
  TotpConfigType,
  totpCreateFormSchema,
  TTotpFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/totpContract";
import { Field, FieldDescription } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Select } from "@app/components/v4/ui/select";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { fieldError, numberInput, ProviderGroup } from "../fields";
import { defineFlowProvider } from "../types";

function TotpFields() {
  const { control, watch } = useFormContext<TTotpFormValues>();
  const configType = watch("inputs.configType");

  return (
    <ProviderGroup id="totp-configuration">
      <Controller
        control={control}
        name="inputs.configType"
        render={({ field, fieldState: { error } }) => (
          <Field label="Configuration Type" error={fieldError(error)}>
            <Select
              value={field.value}
              invalid={Boolean(error)}
              options={[
                { value: TotpConfigType.URL, label: "URL" },
                { value: TotpConfigType.MANUAL, label: "Manual" }
              ]}
              onValueChange={(value) => {
                if (!value || value === field.value) return;
                field.onChange(value);
              }}
            />
          </Field>
        )}
      />

      {configType === TotpConfigType.URL && (
        <Controller
          control={control}
          name="inputs.url"
          render={({ field, fieldState: { error } }) => (
            <Field label="OTP URL" error={fieldError(error)}>
              <Input
                {...field}
                type="password"
                autoComplete="new-password"
                placeholder="otpauth://"
                invalid={Boolean(error)}
              />
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
              <Field label="Secret Key" error={fieldError(error)}>
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter Base32 secret key"
                  invalid={Boolean(error)}
                />
              </Field>
            )}
          />
          <div className="grid grid-cols-3 gap-3">
            {(["period", "digits"] as const).map((key) => (
              <Controller
                key={key}
                control={control}
                name={`inputs.${key}`}
                render={({ field, fieldState: { error } }) => (
                  <Field label={key === "period" ? "Period" : "Digits"} error={fieldError(error)}>
                    <Input
                      {...field}
                      type="number"
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(numberInput(event.target.value))}
                      invalid={Boolean(error)}
                    />
                  </Field>
                )}
              />
            ))}
            <Controller
              control={control}
              name="inputs.algorithm"
              render={({ field, fieldState: { error } }) => (
                <Field label="Algorithm" error={fieldError(error)}>
                  <Select
                    value={field.value}
                    invalid={Boolean(error)}
                    options={[
                      { value: TotpAlgorithm.SHA1, label: "SHA1" },
                      { value: TotpAlgorithm.SHA256, label: "SHA256" },
                      { value: TotpAlgorithm.SHA512, label: "SHA512" }
                    ]}
                    onValueChange={(value) => {
                      if (!value || value === field.value) return;
                      field.onChange(value);
                    }}
                  />
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
    </ProviderGroup>
  );
}

export const totpFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Totp,
  label: "TOTP",
  schema: totpCreateFormSchema,
  getDefaultValues: getTotpCreateDefaultValues,
  toPayload: getTotpCreatePayload,
  Renderer: TotpFields,
  commonFields: {
    defaultTTL: { isVisible: false },
    maxTTL: { isVisible: false }
  },
  submitLabel: "Submit"
});
