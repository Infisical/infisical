import { type JSX, useId } from "react";
import { Control, Controller, FieldValues, Path } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useAdcsConnectionListCertificateTemplates } from "@app/hooks/api/appConnections/adcs";

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  connectionId: string | undefined;
  description: string;
};

export const AdcsTemplateField = <T extends FieldValues>({
  control,
  name,
  connectionId,
  description
}: Props<T>) => {
  const inputId = useId();
  const { data: templates = [], isLoading } = useAdcsConnectionListCertificateTemplates(
    connectionId ?? "",
    {
      enabled: Boolean(connectionId)
    }
  );
  const options = templates.map((t) => ({ value: t.name, label: t.name }));
  type Option = (typeof options)[number];

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => {
        let templateControl: JSX.Element;
        if (isLoading && connectionId) {
          templateControl = (
            <Combobox<Option>
              id={inputId}
              isLoading
              isDisabled
              options={[]}
              value={null}
              onValueChange={() => {}}
              getOptionLabel={(option) => option.label}
              getOptionValue={(option) => option.value}
              placeholder="Loading templates..."
            />
          );
        } else if (options.length > 0) {
          templateControl = (
            <Combobox<Option>
              id={inputId}
              isClearable
              options={options}
              value={options.find((o) => o.value === field.value) ?? null}
              onValueChange={(selected) => field.onChange(selected?.value ?? "")}
              name={field.name}
              onBlur={field.onBlur}
              ref={field.ref}
              getOptionLabel={(o) => o.label}
              getOptionValue={(o) => o.value}
              placeholder="Select a template..."
              isError={Boolean(error)}
            />
          );
        } else {
          templateControl = (
            <Input
              id={inputId}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={typeof field.value === "string" ? field.value : ""}
              onChange={field.onChange}
              placeholder="e.g. CodeSigning"
              isError={Boolean(error)}
            />
          );
        }

        return (
          <Field>
            <FieldLabel htmlFor={inputId}>
              <span className="inline-flex items-center gap-1.5">
                Certificate Template <span className="text-danger">*</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-3.5 w-3.5 text-muted" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    The AD CS template this signer requests. Use a code-signing template published
                    on your CA.
                  </TooltipContent>
                </Tooltip>
              </span>
            </FieldLabel>
            <FieldContent>
              {templateControl}
              <FieldDescription>{description}</FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        );
      }}
    />
  );
};
