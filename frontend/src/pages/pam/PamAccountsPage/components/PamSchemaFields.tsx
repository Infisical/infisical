import { Control, Controller, ControllerRenderProps, useWatch } from "react-hook-form";
import { Info } from "lucide-react";

import { Field, FieldContent, FieldError, FieldLabel } from "@app/components/v3/generic/Field";
import { Input } from "@app/components/v3/generic/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3/generic/Select";
import { Switch } from "@app/components/v3/generic/Switch";
import { TextArea } from "@app/components/v3/generic/TextArea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3/generic/Tooltip";
import { PamFieldWidget, TPamFieldDescriptor } from "@app/hooks/api/pam";

import { TAccountFormValues } from "./accountFormSchema";
import { PamPasswordInput } from "./PamPasswordInput";

type NamePrefix = "connectionDetails" | "credentials";

type Props = {
  control: Control<TAccountFormValues>;
  namePrefix: NamePrefix;
  fields: TPamFieldDescriptor[];
};

const RequiredMark = () => <span className="text-product-pam">*</span>;

type FieldProps = {
  field: ControllerRenderProps<TAccountFormValues>;
  descriptor: TPamFieldDescriptor;
  isError: boolean;
};

const fieldValueAsString = (value: unknown): string => {
  if (Array.isArray(value)) return value.join("\n");
  if (value === undefined || value === null) return "";
  return String(value);
};

const FieldWidget = ({ field, descriptor, isError }: FieldProps) => {
  if (descriptor.secret) {
    return (
      <PamPasswordInput
        value={(field.value as string) ?? ""}
        onChange={field.onChange}
        multiline={descriptor.widget === PamFieldWidget.Textarea}
        isError={isError}
      />
    );
  }

  if (descriptor.widget === PamFieldWidget.Textarea) {
    return (
      <TextArea
        value={fieldValueAsString(field.value)}
        onChange={field.onChange}
        rows={4}
        isError={isError}
      />
    );
  }

  if (descriptor.widget === PamFieldWidget.Select) {
    return (
      <Select value={(field.value as string) ?? ""} onValueChange={field.onChange}>
        <SelectTrigger className="w-full" isError={isError}>
          <SelectValue placeholder={`Select ${descriptor.label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent position="popper">
          {(descriptor.options ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (descriptor.widget === PamFieldWidget.Number) {
    return (
      <Input
        type="number"
        value={(field.value as number | string) ?? ""}
        onChange={(e) => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
        isError={isError}
      />
    );
  }

  return (
    <Input value={fieldValueAsString(field.value)} onChange={field.onChange} isError={isError} />
  );
};

// Renders connection/credential fields from backend-supplied metadata
export const PamSchemaFields = ({ control, namePrefix, fields }: Props) => {
  const values = (useWatch({ control, name: namePrefix }) ?? {}) as Record<string, unknown>;
  const visibleFields = fields.filter(
    (field) => !field.showWhen || values[field.showWhen.field] === field.showWhen.equals
  );

  return (
    <div className="flex flex-col gap-4">
      {visibleFields.map((descriptor) => (
        <Controller
          key={descriptor.key}
          control={control}
          name={`${namePrefix}.${descriptor.key}` as const}
          render={({ field, fieldState }) =>
            descriptor.widget === PamFieldWidget.Boolean ? (
              <Field orientation="horizontal">
                <FieldLabel>
                  {descriptor.label}
                  {(descriptor.required || descriptor.secret) && <RequiredMark />}
                  {descriptor.tooltip && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="text-muted-foreground ml-1 inline h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent className="whitespace-pre-line">
                        {descriptor.tooltip}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </FieldLabel>
                <Switch
                  variant="pam"
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel>
                  {descriptor.label}
                  {(descriptor.required || descriptor.secret) && <RequiredMark />}
                  {descriptor.tooltip && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="text-muted-foreground ml-1 inline h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent className="whitespace-pre-line">
                        {descriptor.tooltip}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </FieldLabel>
                <FieldContent>
                  <FieldWidget field={field} descriptor={descriptor} isError={!!fieldState.error} />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )
          }
        />
      ))}
    </div>
  );
};
