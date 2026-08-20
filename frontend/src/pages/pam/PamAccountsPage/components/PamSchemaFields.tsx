import { useEffect } from "react";
import {
  Control,
  Controller,
  ControllerRenderProps,
  Path,
  UseFormSetValue,
  useWatch
} from "react-hook-form";
import { ExternalLink, Info } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3/generic/Field";
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
import { useOrganization } from "@app/context";
import { PamFieldWidget, TPamFieldDescriptor } from "@app/hooks/api/pam";

import {
  isFieldVisible,
  resolveForcedRule,
  TAccountFormValues,
  TPamFieldGroup,
  TPamFieldGroupValues
} from "./accountFormSchema";
import { PamPasswordInput } from "./PamPasswordInput";

export type TSmartPaste = {
  fieldKey: string;
  hint: string;
  onPaste: (text: string) => boolean;
};

type Props = {
  control: Control<TAccountFormValues>;
  setValue: UseFormSetValue<TAccountFormValues>;
  namePrefix: TPamFieldGroup;
  fields: TPamFieldDescriptor[];
  smartPaste?: TSmartPaste;
};

const RequiredMark = () => <span className="text-product-pam">*</span>;

// Tooltips may reference the org's ID via a {{organizationId}} placeholder (e.g. the AWS IAM role's
// External ID); resolve it here so the user sees their actual ID inline.
const FieldTooltip = ({ text }: { text?: string }) => {
  const { currentOrg } = useOrganization();
  if (!text) return null;
  const resolved = text.replace(/\{\{organizationId\}\}/g, currentOrg.id);
  return (
    <Tooltip>
      <TooltipTrigger>
        <Info className="text-muted-foreground ml-1 inline h-3.5 w-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-line">{resolved}</TooltipContent>
    </Tooltip>
  );
};

type FieldProps = {
  field: ControllerRenderProps<TAccountFormValues>;
  descriptor: TPamFieldDescriptor;
  isError: boolean;
  isDisabled?: boolean;
  smartPaste?: TSmartPaste;
};

const fieldValueAsString = (value: unknown): string => {
  if (Array.isArray(value)) return value.join("\n");
  if (value === undefined || value === null) return "";
  return String(value);
};

const FieldWidget = ({ field, descriptor, isError, isDisabled, smartPaste }: FieldProps) => {
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
        disabled={isDisabled}
      />
    );
  }

  if (descriptor.widget === PamFieldWidget.Select) {
    return (
      <Select
        value={(field.value as string) ?? ""}
        onValueChange={field.onChange}
        disabled={isDisabled}
      >
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
        disabled={isDisabled}
      />
    );
  }

  return (
    <Input
      value={fieldValueAsString(field.value)}
      onChange={field.onChange}
      isError={isError}
      disabled={isDisabled}
      placeholder={smartPaste?.hint}
      onPaste={
        smartPaste &&
        ((e) => {
          const { value, selectionStart, selectionEnd } = e.currentTarget;
          const isReplacingWholeValue =
            !value || (selectionStart === 0 && selectionEnd === value.length);
          if (!isReplacingWholeValue) return;

          const text = e.clipboardData.getData("text");
          if (text.trim() && smartPaste.onPaste(text)) e.preventDefault();
        })
      }
    />
  );
};

// Renders connection/credential fields from backend-supplied metadata
export const PamSchemaFields = ({ control, setValue, namePrefix, fields, smartPaste }: Props) => {
  const [connectionDetails, credentials] = useWatch({
    control,
    name: ["connectionDetails", "credentials"]
  });
  const values: TPamFieldGroupValues = {
    connectionDetails: connectionDetails ?? {},
    credentials: credentials ?? {}
  };

  const forcedRules = fields.map((field) => resolveForcedRule(field, namePrefix, values));

  // The server applies these rules too, so this only keeps the form honest about what it will save
  useEffect(() => {
    fields.forEach((field, idx) => {
      const rule = forcedRules[idx];
      if (rule && values[namePrefix][field.key] !== rule.value) {
        setValue(`${namePrefix}.${field.key}` as Path<TAccountFormValues>, rule.value as never, {
          shouldDirty: true
        });
      }
    });
  });

  return (
    <div className="flex flex-col gap-4">
      {fields.map((descriptor, idx) => {
        if (!isFieldVisible(descriptor, namePrefix, values)) return null;
        const forcedRule = forcedRules[idx];
        const selectedDocsUrl = descriptor.options?.find(
          (option) => option.value === values[namePrefix][descriptor.key]
        )?.docsUrl;

        return (
          <Controller
            key={descriptor.key}
            control={control}
            name={`${namePrefix}.${descriptor.key}` as const}
            render={({ field, fieldState }) =>
              descriptor.widget === PamFieldWidget.Boolean ? (
                <Field orientation="horizontal">
                  <FieldLabel>
                    {descriptor.label}
                    {(descriptor.required || (descriptor.secret && !descriptor.optional)) && (
                      <RequiredMark />
                    )}
                    <FieldTooltip text={forcedRule?.reason ?? descriptor.tooltip} />
                  </FieldLabel>
                  <Switch
                    variant="pam"
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    disabled={Boolean(forcedRule)}
                  />
                </Field>
              ) : (
                <Field>
                  <FieldLabel>
                    {descriptor.label}
                    {(descriptor.required || (descriptor.secret && !descriptor.optional)) && (
                      <RequiredMark />
                    )}
                    <FieldTooltip text={descriptor.tooltip} />
                  </FieldLabel>
                  <FieldContent>
                    <FieldWidget
                      field={field}
                      descriptor={descriptor}
                      isError={!!fieldState.error}
                      isDisabled={Boolean(forcedRule)}
                      smartPaste={smartPaste?.fieldKey === descriptor.key ? smartPaste : undefined}
                    />
                    {selectedDocsUrl && (
                      <FieldDescription>
                        <a
                          href={selectedDocsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1"
                        >
                          Documentation
                          <ExternalLink className="size-3" />
                        </a>
                      </FieldDescription>
                    )}
                    {forcedRule && <FieldDescription>{forcedRule.reason}</FieldDescription>}
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )
            }
          />
        );
      })}
    </div>
  );
};
