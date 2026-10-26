import { Controller, useFormContext } from "react-hook-form";

import {
  getGithubCreateDefaultValues,
  getGithubCreatePayload,
  githubCreateFormSchema,
  TGithubFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/githubContract";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Textarea } from "@app/components/v4/ui/textarea";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { fieldError, ProviderGroup } from "../fields";
import { defineFlowProvider } from "../types";

function GithubFields() {
  const { control } = useFormContext<TGithubFormValues>();

  return (
    <ProviderGroup id="github-credentials">
      <div className="grid grid-cols-2 gap-3">
        {(["appId", "installationId"] as const).map((key) => (
          <Controller
            key={key}
            control={control}
            name={`inputs.${key}`}
            render={({ field, fieldState: { error } }) => (
              <Field
                label={key === "appId" ? "App ID" : "Installation ID"}
                error={fieldError(error)}
              >
                <Input
                  ref={field.ref}
                  name={field.name}
                  type="number"
                  value={field.value || ""}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(Number(event.target.value))}
                  placeholder={key === "appId" ? "0000000" : "00000000"}
                  invalid={Boolean(error)}
                />
              </Field>
            )}
          />
        ))}
        <Controller
          control={control}
          name="inputs.privateKey"
          render={({ field, fieldState: { error } }) => (
            <Field className="col-span-2" label="App Private Key PEM" error={fieldError(error)}>
              <Textarea
                {...field}
                placeholder="-----BEGIN PRIVATE KEY----- ..."
                aria-invalid={Boolean(error) || undefined}
              />
            </Field>
          )}
        />
      </div>
    </ProviderGroup>
  );
}

export const githubFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Github,
  label: "GitHub",
  schema: githubCreateFormSchema,
  getDefaultValues: getGithubCreateDefaultValues,
  toPayload: getGithubCreatePayload,
  Renderer: GithubFields,
  commonFields: {
    defaultTTL: {
      isDisabled: true,
      description: "GitHub token TTL is fixed to 1 hour"
    },
    maxTTL: { isVisible: false }
  },
  submitLabel: "Submit"
});
