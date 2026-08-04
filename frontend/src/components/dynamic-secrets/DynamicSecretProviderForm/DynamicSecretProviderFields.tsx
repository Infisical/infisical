import { Controller, FieldValues, useFormContext } from "react-hook-form";

import {
  Field,
  FieldFeedback,
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((fieldDefinition) => {
        const inputId = getFieldId(fieldDefinition.name);
        const feedbackId = `${inputId}-feedback`;

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
              const hasFeedback = Boolean(fieldDefinition.description || error?.message);
              const describedBy = hasFeedback ? feedbackId : undefined;
              let input;

              if (fieldDefinition.type === "switch") {
                input = (
                  <Switch
                    ref={field.ref}
                    id={inputId}
                    checked={Boolean(field.value)}
                    onBlur={field.onBlur}
                    onCheckedChange={field.onChange}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(error)}
                  />
                );
              } else if (fieldDefinition.type === "select") {
                input = (
                  <Select
                    value={String(value)}
                    onValueChange={(nextValue) => {
                      // Radix Select can emit a spurious empty onValueChange while options mount.
                      if (!nextValue || nextValue === String(value)) return;
                      field.onChange(nextValue);
                    }}
                  >
                    <SelectTrigger
                      ref={field.ref}
                      id={inputId}
                      onBlur={field.onBlur}
                      isError={Boolean(error)}
                      aria-describedby={describedBy}
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
                    isError={Boolean(error)}
                    aria-describedby={describedBy}
                  />
                );
              } else {
                let inputType = "text";
                if (fieldDefinition.type === "secret") inputType = "password";
                if (fieldDefinition.type === "number") inputType = "number";

                input = (
                  <Input
                    ref={field.ref}
                    id={inputId}
                    name={field.name}
                    value={value}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    type={inputType}
                    autoComplete={fieldDefinition.autoComplete}
                    placeholder={fieldDefinition.placeholder}
                    isError={Boolean(error)}
                    aria-describedby={describedBy}
                  />
                );
              }

              return (
                <Field
                  data-invalid={Boolean(error)}
                  className={cn(fieldDefinition.layout !== "half" && "sm:col-span-2")}
                >
                  <FieldLabel htmlFor={inputId}>
                    {fieldDefinition.label}
                    {fieldDefinition.isOptional && (
                      <span className="font-normal text-muted">(optional)</span>
                    )}
                  </FieldLabel>
                  {input}
                  {hasFeedback && (
                    <FieldFeedback
                      id={feedbackId}
                      description={fieldDefinition.description}
                      error={error?.message}
                    />
                  )}
                </Field>
              );
            }}
          />
        );
      })}
    </div>
  );
};
