import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, TrashIcon } from "lucide-react";

import {
  Button,
  Checkbox,
  CopyButton,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { AgentVaultSubstitutionSurface } from "@app/hooks/api/agentVault";

import { SecretInput } from "./CredentialFields";
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">Headers</p>
          <p className="mt-1 text-xs text-muted">
            Added to every request to this service, on top of the credential.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-container/50 p-4">
          {headers.fields.length === 0 && (
            <p className="text-center text-sm text-muted">No headers added. Add one below.</p>
          )}
          {headers.fields.map((row, index) => (
            <div key={row.id} className="flex items-start gap-3">
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
                        placeholder="Token"
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
                size="xs"
                className={cn(
                  index === 0 ? "mt-6.5" : "mt-0.5",
                  "transition-transform hover:text-danger"
                )}
                onClick={() => headers.remove(index)}
              >
                <TrashIcon className="size-4" />
              </IconButton>
            </div>
          ))}
        </div>

        {headers.fields.length < MAX_HEADERS && (
          <Button
            variant="ghost"
            size="xs"
            className="self-start"
            onClick={() => headers.append({ name: "", prefix: "", value: "" })}
          >
            <PlusIcon className="mr-1 size-4" />
            Add Header
          </Button>
        )}

        <Controller
          control={control}
          name="headers"
          render={({ fieldState }) => <FieldError>{fieldState.error?.message}</FieldError>}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">Substitutions</p>
          <p className="mt-1 text-xs text-muted">
            Your agent sends a placeholder. The proxy swaps it for the real value before forwarding.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {substitutions.fields.length === 0 && (
            <div className="rounded-md border border-border bg-container/50 p-4">
              <p className="text-center text-sm text-muted">
                No substitutions added. Add one below.
              </p>
            </div>
          )}
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
                            placeholder="__API_TOKEN__"
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
                  size="xs"
                  className="mt-6.5 transition-transform hover:text-danger"
                  onClick={() => substitutions.remove(index)}
                >
                  <TrashIcon className="size-4" />
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
              variant="ghost"
              size="xs"
              className="self-start"
              onClick={() =>
                substitutions.append({
                  placeholder: "",
                  value: "",
                  surfaces: [AgentVaultSubstitutionSurface.Header]
                })
              }
            >
              <PlusIcon className="mr-1 size-4" />
              Add Substitution
            </Button>
          )}

          <Controller
            control={control}
            name="substitutions"
            render={({ fieldState }) => <FieldError>{fieldState.error?.message}</FieldError>}
          />
        </div>
      </div>
    </div>
  );
};
