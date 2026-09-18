import { Control, Controller } from "react-hook-form";

import { Checkbox, Field, FieldLabel } from "@app/components/v3";

type KeyUsageOption = {
  label: string;
  value: string;
};

type KeyUsageSectionProps = {
  control: Control<any>;
  title: string;
  namePrefix: string;
  options: KeyUsageOption[];
  requiredUsages: string[];
  shouldUnregister?: boolean;
};

export const KeyUsageSection = ({
  control,
  title,
  namePrefix,
  options,
  requiredUsages,
  shouldUnregister
}: KeyUsageSectionProps) => {
  if (options.length === 0) return null;

  return (
    <Field className="mb-4">
      <FieldLabel>{title}</FieldLabel>
      <div className="grid grid-cols-2 gap-3">
        {options.map(({ label, value }) => {
          const isRequired = requiredUsages.includes(value);
          return (
            <Controller
              key={value}
              control={control}
              name={`${namePrefix}.${value}` as any}
              shouldUnregister={shouldUnregister}
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={`${namePrefix}-${value}`}
                    variant="project"
                    isChecked={isRequired || Boolean(field.value)}
                    isDisabled={isRequired}
                    onCheckedChange={(checked) => {
                      if (!isRequired) field.onChange(checked);
                    }}
                  />
                  <label
                    htmlFor={`${namePrefix}-${value}`}
                    className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                  >
                    {label}
                    {isRequired && <span className="text-xs text-muted">(Required)</span>}
                  </label>
                </div>
              )}
            />
          );
        })}
      </div>
    </Field>
  );
};
