import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import {
  gcpIamCreateFormSchema,
  getGcpIamCreateDefaultValues,
  getGcpIamCreatePayload,
  TGcpIamFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/gcpIamContract";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { fieldError, ProviderGroup } from "../fields";
import { defineFlowProvider } from "../types";

const LOCAL_ORG_ID = "6f1c2a9e-4b7d-4e21-9a3c-8d5f0b2e7c14";

function GcpIamFields() {
  const suffix = LOCAL_ORG_ID.split("-").slice(0, 2).join("-");
  const { control } = useFormContext<TGcpIamFormValues>();
  const scopes = useFieldArray({ control, name: "inputs.tokenScopes" });

  return (
    <ProviderGroup id="gcp-iam-configuration">
      <Controller
        control={control}
        name="inputs.serviceAccountEmail"
        render={({ field, fieldState: { error } }) => (
          <Field
            label="Service Account Email"
            description={`The service account ID (the part before "@") must end with the first two sections of your organization ID: "${suffix}". Example: my-service-account-${suffix}@my-project.iam.gserviceaccount.com`}
            error={fieldError(error)}
          >
            <Input
              {...field}
              placeholder="example@project.iam.gserviceaccount.com"
              invalid={Boolean(error)}
            />
          </Field>
        )}
      />
      <Field label="Token Scopes" group>
        <Stack gap={12} align="start">
          {scopes.fields.map(({ id }, index) => (
            <Controller
              key={id}
              control={control}
              name={`inputs.tokenScopes.${index}.value`}
              render={({ field, fieldState: { error } }) => (
                <div className="flex w-full items-end gap-3">
                  <Field className="flex-1" label="Token Scope" error={fieldError(error)}>
                    <Input
                      {...field}
                      placeholder="https://www.googleapis.com/auth/cloud-platform"
                      invalid={Boolean(error)}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    icon="trash"
                    iconOnly
                    aria-label={`Remove scope ${index + 1}`}
                    onClick={() => scopes.remove(index)}
                  >
                    Remove scope {index + 1}
                  </Button>
                </div>
              )}
            />
          ))}
          <Button
            variant="outline"
            type="button"
            size="sm"
            icon="plus"
            onClick={() => scopes.append({ value: "" })}
          >
            Add Scope
          </Button>
        </Stack>
      </Field>
    </ProviderGroup>
  );
}

export const gcpIamFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.GcpIam,
  label: "GCP IAM",
  schema: gcpIamCreateFormSchema,
  getDefaultValues: getGcpIamCreateDefaultValues,
  toPayload: getGcpIamCreatePayload,
  Renderer: GcpIamFields,
  submitLabel: "Submit"
});
