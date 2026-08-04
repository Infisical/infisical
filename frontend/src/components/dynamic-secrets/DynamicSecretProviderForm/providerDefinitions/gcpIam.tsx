import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import {
  Button,
  Field,
  FieldError,
  FieldFeedback,
  FieldLabel,
  IconButton,
  Input
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { defineDynamicSecretProvider } from "../types";
import {
  gcpIamCreateFormSchema,
  gcpIamEditFormSchema,
  getGcpIamCreateDefaultValues,
  getGcpIamCreatePayload,
  getGcpIamEditDefaultValues,
  getGcpIamEditPayload,
  TGcpIamFormValues
} from "./gcpIamContract";

const GcpIamFields = () => {
  const { currentOrg } = useOrganization();
  const suffix = currentOrg.id.split("-").slice(0, 2).join("-");
  const { control } = useFormContext<TGcpIamFormValues>();
  const scopes = useFieldArray({ control, name: "inputs.tokenScopes" });

  return (
    <DynamicSecretProviderGroup id="gcp-iam-configuration" presentation="panel">
      <Controller
        control={control}
        name="inputs.serviceAccountEmail"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="gcp-service-account-email">Service Account Email</FieldLabel>
            <Input
              {...field}
              id="gcp-service-account-email"
              placeholder="example@project.iam.gserviceaccount.com"
              isError={Boolean(error)}
              aria-describedby="gcp-service-account-feedback"
            />
            <FieldFeedback
              id="gcp-service-account-feedback"
              description={`The service account ID must end with your organization suffix: ${suffix}.`}
              error={error?.message}
            />
          </Field>
        )}
      />
      <Field>
        <FieldLabel>Token Scopes</FieldLabel>
        <div className="flex flex-col gap-3">
          {scopes.fields.map(({ id }, index) => (
            <Controller
              key={id}
              control={control}
              name={`inputs.tokenScopes.${index}.value`}
              render={({ field, fieldState: { error } }) => (
                <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`gcp-scope-${index}`}>Token Scope</FieldLabel>
                    <Input
                      {...field}
                      id={`gcp-scope-${index}`}
                      placeholder="https://www.googleapis.com/auth/cloud-platform"
                      isError={Boolean(error)}
                      aria-describedby={error ? `gcp-scope-${index}-error` : undefined}
                    />
                    <FieldError id={`gcp-scope-${index}-error`}>{error?.message}</FieldError>
                  </Field>
                  <div className="flex flex-col gap-2">
                    <FieldLabel className="invisible pointer-events-none select-none" aria-hidden>
                      &nbsp;
                    </FieldLabel>
                    <IconButton
                      type="button"
                      variant="outline"
                      aria-label={`Remove scope ${index + 1}`}
                      onClick={() => scopes.remove(index)}
                    >
                      <Trash2Icon />
                    </IconButton>
                  </div>
                </div>
              )}
            />
          ))}
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => scopes.append({ value: "" })}
          >
            <PlusIcon />
            Add Scope
          </Button>
        </div>
      </Field>
    </DynamicSecretProviderGroup>
  );
};

export const gcpIamDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.GcpIam,
  label: "GCP IAM",
  customRenderer: {
    reasons: ["repeatable-fields", "context-aware-fields"],
    Component: GcpIamFields
  },
  create: {
    schema: gcpIamCreateFormSchema,
    getDefaultValues: getGcpIamCreateDefaultValues,
    toPayload: getGcpIamCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: gcpIamEditFormSchema,
    getDefaultValues: getGcpIamEditDefaultValues,
    toPayload: getGcpIamEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});
