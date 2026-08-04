import { Controller, useFormContext } from "react-hook-form";

import { Field, FieldError, FieldLabel, Input } from "@app/components/v3";
import { SecretInput } from "@app/components/v3/platform";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { defineDynamicSecretProvider } from "../types";
import {
  getGithubCreateDefaultValues,
  getGithubCreatePayload,
  getGithubEditDefaultValues,
  getGithubEditPayload,
  githubCreateFormSchema,
  githubEditFormSchema,
  TGithubFormValues
} from "./githubContract";

const GithubFields = () => {
  const { control } = useFormContext<TGithubFormValues>();

  return (
    <DynamicSecretProviderGroup id="github-credentials" presentation="panel">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {(["appId", "installationId"] as const).map((key) => (
        <Controller
          key={key}
          control={control}
          name={`inputs.${key}`}
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`github-${key}`}>
                {key === "appId" ? "App ID" : "Installation ID"}
              </FieldLabel>
              <Input
                ref={field.ref}
                id={`github-${key}`}
                name={field.name}
                type="number"
                value={field.value || ""}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(Number(event.target.value))}
                placeholder={key === "appId" ? "0000000" : "00000000"}
                isError={Boolean(error)}
                aria-describedby={error ? `github-${key}-error` : undefined}
              />
              <FieldError id={`github-${key}-error`}>{error?.message}</FieldError>
            </Field>
          )}
        />
      ))}
      <Controller
        control={control}
        name="inputs.privateKey"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)} className="sm:col-span-2">
            <FieldLabel htmlFor="github-private-key">App Private Key PEM</FieldLabel>
            <SecretInput
              {...field}
              id="github-private-key"
              aria-describedby={error ? "github-private-key-error" : undefined}
            />
            <FieldError id="github-private-key-error">{error?.message}</FieldError>
          </Field>
        )}
      />
      </div>
    </DynamicSecretProviderGroup>
  );
};

const fixedTtlFields = {
  defaultTTL: {
    isDisabled: true,
    description: "GitHub token TTL is fixed to 1 hour"
  },
  maxTTL: { isVisible: false }
} as const;

export const githubDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Github,
  label: "GitHub",
  create: {
    schema: githubCreateFormSchema,
    getDefaultValues: getGithubCreateDefaultValues,
    toPayload: getGithubCreatePayload,
    customRenderer: { reasons: ["non-scalar-value"], Component: GithubFields },
    commonFields: fixedTtlFields,
    submitLabel: "Submit"
  },
  edit: {
    schema: githubEditFormSchema,
    getDefaultValues: getGithubEditDefaultValues,
    toPayload: getGithubEditPayload,
    customRenderer: { reasons: ["non-scalar-value"], Component: GithubFields },
    commonFields: fixedTtlFields,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});
