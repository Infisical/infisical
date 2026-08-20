import { Controller, FieldValues, useFormContext } from "react-hook-form";

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
  SelectValue,
  Switch,
  TextArea
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import { parseDynamicSecretProviderNumberInput } from "./scalarValues";
import { TDynamicSecretProviderField } from "./types";

type Props<TValues extends FieldValues> = {
  fields: readonly TDynamicSecretProviderField<TValues>[];
};

const getFieldId = (name: string) => `dynamic-secret-${name.replaceAll(".", "-")}`;

export const DynamicSecretProviderFields = <TValues extends FieldValues>({
  fields
}: Props<TValues>) => {
  const { control } = useFormContext<TValues>();

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        {fields.map((fieldDefinition) => {
          const inputId = getFieldId(fieldDefinition.name);
          const descriptionId = `${inputId}-description`;
          const errorId = `${inputId}-error`;

          return (
            <Controller
              key={fieldDefinition.name}
              control={control}
              name={fieldDefinition.name}
              render={({ field, fieldState: { error } }) => {
                const value =
                  typeof field.value === "string" || typeof field.value === "number"
                    ? field.value
                    : "";
                const describedBy = [
                  fieldDefinition.description ? descriptionId : undefined,
                  error?.message ? errorId : undefined
                ]
                  .filter(Boolean)
                  .join(" ");
                let input;

                if (fieldDefinition.type === "switch") {
                  input = (
                    <Switch
                      ref={field.ref}
                      id={inputId}
                      variant="project"
                      checked={Boolean(field.value)}
                      onBlur={field.onBlur}
                      onCheckedChange={field.onChange}
                      disabled={fieldDefinition.isDisabled}
                      aria-describedby={describedBy || undefined}
                      aria-invalid={Boolean(error)}
                    />
                  );
                } else if (fieldDefinition.type === "select") {
                  input = (
                    <Select
                      value={String(value)}
                      disabled={fieldDefinition.isDisabled}
                      onValueChange={(nextValue) => {
                        // Radix Select can emit an empty change while options mount.
                        if (!nextValue || nextValue === String(value)) return;
                        field.onChange(nextValue);
                      }}
                    >
                      <SelectTrigger
                        ref={field.ref}
                        id={inputId}
                        onBlur={field.onBlur}
                        isError={Boolean(error)}
                        aria-describedby={describedBy || undefined}
                        className="w-full"
                      >
                        <SelectValue placeholder={fieldDefinition.placeholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldDefinition.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                } else if (fieldDefinition.type === "textarea") {
                  input = (
                    <TextArea
                      ref={field.ref}
                      id={inputId}
                      name={field.name}
                      value={value}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      rows={fieldDefinition.rows}
                      placeholder={fieldDefinition.placeholder}
                      disabled={fieldDefinition.isDisabled}
                      isError={Boolean(error)}
                      aria-describedby={describedBy || undefined}
                    />
                  );
                } else {
                  const isNumber = fieldDefinition.type === "number";
                  let inputType = "text";
                  if (isNumber) inputType = "number";
                  if (fieldDefinition.type === "secret") inputType = "password";
                  input = (
                    <Input
                      ref={field.ref}
                      id={inputId}
                      name={field.name}
                      value={value}
                      onBlur={field.onBlur}
                      onChange={
                        isNumber
                          ? (event) =>
                              field.onChange(
                                parseDynamicSecretProviderNumberInput(event.currentTarget.value)
                              )
                          : field.onChange
                      }
                      type={inputType}
                      autoComplete={
                        fieldDefinition.type === "number" ? undefined : fieldDefinition.autoComplete
                      }
                      min={isNumber ? fieldDefinition.min : undefined}
                      max={isNumber ? fieldDefinition.max : undefined}
                      step={isNumber ? fieldDefinition.step : undefined}
                      placeholder={fieldDefinition.placeholder}
                      disabled={fieldDefinition.isDisabled}
                      isError={Boolean(error)}
                      aria-describedby={describedBy || undefined}
                    />
                  );
                }

                return (
                  <Field
                    data-invalid={Boolean(error)}
                    className={cn(fieldDefinition.layout !== "half" && "@xl:col-span-2")}
                  >
                    <FieldLabel htmlFor={inputId}>
                      {fieldDefinition.label}
                      {fieldDefinition.isOptional && (
                        <span className="font-normal text-muted">(optional)</span>
                      )}
                    </FieldLabel>
                    {input}
                    {fieldDefinition.description && (
                      <FieldDescription id={descriptionId}>
                        {fieldDefinition.description}
                      </FieldDescription>
                    )}
                    {error?.message && <FieldError id={errorId}>{error.message}</FieldError>}
                  </Field>
                );
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
