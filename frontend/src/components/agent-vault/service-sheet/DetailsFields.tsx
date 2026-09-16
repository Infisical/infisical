import { Controller, useFormContext } from "react-hook-form";

import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TagsInput
} from "@app/components/v3";
import { hostError } from "@app/helpers/agentVaultHostPattern";
import { pathPrefixError } from "@app/helpers/agentVaultPathPrefix";

import { HTTP_METHODS, isAllMethods, TServiceForm } from "./serviceSchema";

export const DetailsFields = () => {
  const { control, trigger, clearErrors } = useFormContext<TServiceForm>();

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <Input {...field} placeholder="datadog-us5" isError={Boolean(fieldState.error)} />
              <FieldDescription>Use lowercase letters, numbers, and hyphens.</FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="hosts"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>Hosts</FieldLabel>
            <FieldContent>
              <Controller
                control={control}
                name="hostDraft"
                render={({ field: draft }) => (
                  <TagsInput
                    value={field.value}
                    onValueChange={field.onChange}
                    inputValue={draft.value}
                    onInputValueChange={(next) => {
                      draft.onChange(next);
                      if (fieldState.error) clearErrors("hosts");
                    }}
                    validateTag={hostError}
                    onValidationError={(reason) =>
                      reason ? trigger("hosts") : clearErrors("hosts")
                    }
                    isError={Boolean(fieldState.error)}
                    aria-label="Hosts"
                    placeholder="api.datadoghq.com"
                  />
                )}
              />
              <FieldDescription>
                The credential is only sent to these hosts. Wildcards like *.example.com are
                allowed.
              </FieldDescription>
              <FieldError
                errors={Array.isArray(fieldState.error) ? fieldState.error : [fieldState.error]}
              />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="methods"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>Methods</FieldLabel>
            <FieldContent>
              <Field orientation="horizontal">
                <Checkbox
                  id="all-methods"
                  isChecked={isAllMethods(field.value)}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true ? [...HTTP_METHODS] : [])
                  }
                />
                <FieldLabel htmlFor="all-methods">All Methods</FieldLabel>
              </Field>

              {/* Indented under the checkbox label so the seven read as what "All Methods" governs.
                  Fixed columns line the boxes up; w-fit keeps them hugging the labels rather than
                  stretching across the width of the sheet. */}
              <div
                role="group"
                aria-label="Methods"
                className="mt-2 ml-6 grid w-fit grid-cols-4 gap-x-8 gap-y-2"
              >
                {HTTP_METHODS.map((method) => (
                  <Field key={method} orientation="horizontal" className="w-auto">
                    <Checkbox
                      id={`method-${method}`}
                      isChecked={field.value.includes(method)}
                      onCheckedChange={(checked) =>
                        // Rebuilt from the canonical list so a rechecked method lands back in its
                        // old slot rather than at the end.
                        field.onChange(
                          HTTP_METHODS.filter((candidate) =>
                            candidate === method
                              ? checked === true
                              : field.value.includes(candidate)
                          )
                        )
                      }
                    />
                    <FieldLabel htmlFor={`method-${method}`}>{method}</FieldLabel>
                  </Field>
                ))}
              </div>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="pathPrefixes"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>Paths</FieldLabel>
            <FieldContent>
              <Controller
                control={control}
                name="pathDraft"
                render={({ field: draft }) => (
                  <TagsInput
                    value={field.value}
                    onValueChange={field.onChange}
                    inputValue={draft.value}
                    onInputValueChange={(next) => {
                      draft.onChange(next);
                      if (fieldState.error) clearErrors("pathPrefixes");
                    }}
                    // A comma is legal inside a path, so only Enter, Tab and blur commit here.
                    separators={[]}
                    validateTag={pathPrefixError}
                    onValidationError={(reason) =>
                      reason ? trigger("pathPrefixes") : clearErrors("pathPrefixes")
                    }
                    isError={Boolean(fieldState.error)}
                    aria-label="Path prefixes"
                    placeholder="/api/v1"
                  />
                )}
              />
              <FieldDescription>
                A prefix matches whole segments, so /api/v1 covers /api/v1/users but not /api/v10.
              </FieldDescription>
              <FieldError
                errors={Array.isArray(fieldState.error) ? fieldState.error : [fieldState.error]}
              />
            </FieldContent>
          </Field>
        )}
      />
    </div>
  );
};
