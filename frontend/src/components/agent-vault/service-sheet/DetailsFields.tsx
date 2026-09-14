import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { TrashIcon } from "lucide-react";

import {
  Button,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  IconButton,
  Input,
  TextArea
} from "@app/components/v3";

import { HTTP_METHODS, MAX_PATH_PREFIXES, TServiceForm } from "./serviceSchema";

export const DetailsFields = () => {
  const { control, watch, setValue } = useFormContext<TServiceForm>();
  const allMethods = watch("allMethods");
  const allPaths = watch("allPaths");

  const pathPrefixes = useFieldArray({ control, name: "pathPrefixes" });

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
              <FieldDescription>Lowercase letters, numbers and hyphens.</FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="hostPattern"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>Hosts</FieldLabel>
            <FieldContent>
              <TextArea
                {...field}
                rows={3}
                placeholder="api.datadoghq.com"
                isError={Boolean(fieldState.error)}
              />
              <FieldDescription>
                Comma separated. Wildcards like *.example.com are allowed.
              </FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />

      <FieldSet>
        <FieldLegend>Methods</FieldLegend>
        <FieldContent>
          <Controller
            control={control}
            name="allMethods"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="all-methods"
                  isChecked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked === true);
                    // Dropping the selection on the way back to All keeps one meaning per state: the
                    // list is only ever read when the box is unchecked.
                    if (checked === true) setValue("methods", [], { shouldDirty: true });
                  }}
                />
                <FieldLabel htmlFor="all-methods">All Methods</FieldLabel>
              </Field>
            )}
          />

          {!allMethods && (
            <Controller
              control={control}
              name="methods"
              render={({ field, fieldState }) => (
                <FieldContent>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {HTTP_METHODS.map((method) => (
                      <Field key={method} orientation="horizontal" className="w-auto">
                        <Checkbox
                          id={`method-${method}`}
                          isChecked={field.value.includes(method)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked === true
                                ? [...field.value, method]
                                : field.value.filter((value) => value !== method)
                            )
                          }
                        />
                        <FieldLabel htmlFor={`method-${method}`} className="font-mono">
                          {method}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              )}
            />
          )}
        </FieldContent>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Paths</FieldLegend>
        <FieldContent>
          <Controller
            control={control}
            name="allPaths"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="all-paths"
                  isChecked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked === true);
                    if (checked === true) setValue("pathPrefixes", [], { shouldDirty: true });
                    else if (pathPrefixes.fields.length === 0) pathPrefixes.append({ value: "" });
                  }}
                />
                <FieldLabel htmlFor="all-paths">All Paths</FieldLabel>
              </Field>
            )}
          />

          {!allPaths && (
            <FieldContent>
              {pathPrefixes.fields.map((row, index) => (
                <Controller
                  key={row.id}
                  control={control}
                  name={`pathPrefixes.${index}.value`}
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldContent>
                        <div className="flex items-center gap-2">
                          <Input
                            {...field}
                            placeholder="/repos"
                            className="font-mono"
                            isError={Boolean(fieldState.error)}
                          />
                          <IconButton
                            aria-label="Remove path prefix"
                            variant="ghost"
                            onClick={() => pathPrefixes.remove(index)}
                          >
                            <TrashIcon />
                          </IconButton>
                        </div>
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
              ))}
              {pathPrefixes.fields.length < MAX_PATH_PREFIXES && (
                <Button
                  size="xs"
                  variant="outline"
                  className="self-start"
                  onClick={() => pathPrefixes.append({ value: "" })}
                >
                  Add Path Prefix
                </Button>
              )}
              <Controller
                control={control}
                name="pathPrefixes"
                render={({ fieldState }) => <FieldError>{fieldState.error?.message}</FieldError>}
              />
            </FieldContent>
          )}
        </FieldContent>
      </FieldSet>
    </div>
  );
};
