import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { TrashIcon } from "lucide-react";

import {
  Button,
  Checkbox,
  CodeBlock,
  CopyButton,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  IconButton,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@app/components/v3";
import { AgentVaultCredentialType, AgentVaultSubstitutionSurface } from "@app/hooks/api/agentVault";

import { credentialPreview, SecretInput } from "./CredentialFields";
import {
  MAX_HEADERS,
  MAX_SUBSTITUTIONS,
  SURFACE_LABELS,
  TServiceForm,
  UNCHANGED_SECRET
} from "./serviceSchema";

const SURFACES = Object.values(AgentVaultSubstitutionSurface);

export const TransformationsFields = () => {
  const { control } = useFormContext<TServiceForm>();
  const headers = useFieldArray({ control, name: "headers" });
  const substitutions = useFieldArray({ control, name: "substitutions" });

  const form = useWatch({ control }) as TServiceForm;
  const isBasic = form.credentialType === AgentVaultCredentialType.Basic;
  // Same placeholder the Credential step shows, so the two previews agree for basic auth.
  const credentialLine = credentialPreview(
    form,
    isBasic ? "base64(<username>:<password>)" : "<token>"
  );
  const sends = [
    credentialLine,
    ...form.headers
      .filter((header) => header.name)
      .map((header) => `${header.name}: ${header.prefix ? `${header.prefix} ` : ""}••••••••`),
    ...form.substitutions
      .filter((substitution) => substitution.placeholder && substitution.surfaces.length)
      .map(
        (substitution) =>
          `${substitution.placeholder} → •••••••• in ${substitution.surfaces
            .map((surface) => SURFACE_LABELS[surface].toLowerCase())
            .join(", ")}`
      )
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <FieldSet>
        <FieldLegend>Headers</FieldLegend>
        <FieldDescription>
          Added to every request to this service, on top of the credential.
        </FieldDescription>
        <FieldGroup>
          {headers.fields.map((row, index) => (
            <div key={row.id} className="flex items-start gap-2">
              <Controller
                control={control}
                name={`headers.${index}.name`}
                render={({ field, fieldState }) => (
                  <Field className="flex-1">
                    <FieldContent>
                      {index === 0 && <FieldLabel className="text-xs">Name</FieldLabel>}
                      <Input
                        {...field}
                        aria-label="Header name"
                        placeholder="X-Org-Id"
                        className="font-mono"
                        isError={Boolean(fieldState.error)}
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`headers.${index}.prefix`}
                render={({ field, fieldState }) => (
                  <Field className="w-28">
                    <FieldContent>
                      {index === 0 && <FieldLabel className="text-xs">Prefix</FieldLabel>}
                      <Input
                        {...field}
                        aria-label="Header prefix"
                        isError={Boolean(fieldState.error)}
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`headers.${index}.value`}
                render={({ field, fieldState }) => (
                  <Field className="flex-1">
                    <FieldContent>
                      {index === 0 && <FieldLabel className="text-xs">Value</FieldLabel>}
                      <SecretInput
                        field={field}
                        label="Header value"
                        ariaLabel="Header value"
                        placeholder="Enter the value"
                        isError={Boolean(fieldState.error)}
                        isUntouched={field.value === UNCHANGED_SECRET}
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </FieldContent>
                  </Field>
                )}
              />
              <IconButton
                aria-label={`Remove header ${index + 1}`}
                variant="ghost"
                className={index === 0 ? "mt-6.5" : "mt-0.5"}
                onClick={() => headers.remove(index)}
              >
                <TrashIcon />
              </IconButton>
            </div>
          ))}

          {headers.fields.length < MAX_HEADERS && (
            <Button
              size="xs"
              variant="outline"
              className="self-start"
              onClick={() => headers.append({ name: "", prefix: "", value: "" })}
            >
              Add Header
            </Button>
          )}

          <Controller
            control={control}
            name="headers"
            render={({ fieldState }) => <FieldError>{fieldState.error?.message}</FieldError>}
          />
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Substitutions</FieldLegend>
        <FieldDescription>
          Your agent sends a placeholder; the proxy swaps it for the real value before forwarding.
        </FieldDescription>
        <FieldGroup>
          {substitutions.fields.map((row, index) => (
            <div
              key={row.id}
              className="flex flex-col gap-3 rounded-md border border-border bg-container/50 p-4"
            >
              <div className="flex items-start gap-2">
                <Controller
                  control={control}
                  name={`substitutions.${index}.placeholder`}
                  render={({ field, fieldState }) => (
                    <Field className="flex-1">
                      <FieldContent>
                        <FieldLabel className="text-xs">Replace</FieldLabel>
                        <InputGroup>
                          <InputGroupInput
                            {...field}
                            aria-label="Placeholder"
                            placeholder="__GITHUB_PAT__"
                            className="font-mono"
                            isError={Boolean(fieldState.error)}
                          />
                          {Boolean(field.value) && (
                            <InputGroupAddon align="inline-end">
                              <CopyButton
                                value={field.value}
                                ariaLabel="Copy placeholder"
                                size="xs"
                              />
                            </InputGroupAddon>
                          )}
                        </InputGroup>
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name={`substitutions.${index}.value`}
                  render={({ field, fieldState }) => (
                    <Field className="flex-1">
                      <FieldContent>
                        <FieldLabel className="text-xs">With</FieldLabel>
                        <SecretInput
                          field={field}
                          label="Substitution value"
                          ariaLabel="Substitution value"
                          placeholder="Enter the real value"
                          isError={Boolean(fieldState.error)}
                          isUntouched={field.value === UNCHANGED_SECRET}
                        />
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
                <IconButton
                  aria-label={`Remove substitution ${index + 1}`}
                  variant="ghost"
                  className="mt-6.5"
                  onClick={() => substitutions.remove(index)}
                >
                  <TrashIcon />
                </IconButton>
              </div>

              <Controller
                control={control}
                name={`substitutions.${index}.surfaces`}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldContent>
                      <FieldLabel className="text-xs">Look In</FieldLabel>
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {SURFACES.map((surface) => (
                          <Field key={surface} orientation="horizontal" className="w-auto">
                            <Checkbox
                              id={`surface-${index}-${surface}`}
                              isChecked={field.value.includes(surface)}
                              onCheckedChange={(checked) =>
                                field.onChange(
                                  checked === true
                                    ? [...field.value, surface]
                                    : field.value.filter((value) => value !== surface)
                                )
                              }
                            />
                            <FieldLabel htmlFor={`surface-${index}-${surface}`}>
                              {SURFACE_LABELS[surface]}
                            </FieldLabel>
                          </Field>
                        ))}
                      </div>
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </FieldContent>
                  </Field>
                )}
              />
            </div>
          ))}

          {substitutions.fields.length < MAX_SUBSTITUTIONS && (
            <Button
              size="xs"
              variant="outline"
              className="self-start"
              onClick={() =>
                substitutions.append({
                  placeholder: "",
                  value: "",
                  surfaces: [AgentVaultSubstitutionSurface.Header]
                })
              }
            >
              Add Substitution
            </Button>
          )}

          <Controller
            control={control}
            name="substitutions"
            render={({ fieldState }) => <FieldError>{fieldState.error?.message}</FieldError>}
          />
        </FieldGroup>
      </FieldSet>

      {sends.length > 0 && <CodeBlock label="Sends" isCopyable={false} value={sends.join("\n")} />}
    </div>
  );
};
