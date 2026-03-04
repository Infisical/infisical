import { Control, Controller } from "react-hook-form";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Checkbox,
  FormLabel
} from "@app/components/v2";

type KeyUsageOption = {
  label: string;
  value: string;
};

type KeyUsageSectionProps = {
  control: Control<any>;
  title: string;
  accordionValue: string;
  namePrefix: string;
  options: KeyUsageOption[];
  requiredUsages: string[];
  shouldUnregister?: boolean;
};

export const KeyUsageSection = ({
  control,
  title,
  accordionValue,
  namePrefix,
  options,
  requiredUsages,
  shouldUnregister
}: KeyUsageSectionProps) => {
  if (options.length === 0) return null;

  return (
    <AccordionItem value={accordionValue}>
      <AccordionTrigger>{title}</AccordionTrigger>
      <AccordionContent forceMount className="data-[state=closed]:hidden">
        <div className="grid grid-cols-2 gap-2 pl-2">
          {options.map(({ label, value }) => {
            const isRequired = requiredUsages.includes(value);
            return (
              <Controller
                key={label}
                control={control}
                name={`${namePrefix}.${value}` as any}
                shouldUnregister={shouldUnregister}
                render={({ field }) => (
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id={`${namePrefix}-${value}`}
                      isChecked={field.value || false}
                      onCheckedChange={(checked) => {
                        if (!isRequired) {
                          field.onChange(checked);
                        }
                      }}
                      isDisabled={isRequired}
                    />
                    <div className="flex items-center gap-2">
                      <FormLabel
                        id={`${namePrefix}-${value}`}
                        className={`text-sm ${
                          isRequired ? "text-mineshaft-200" : "cursor-pointer text-mineshaft-300"
                        }`}
                        label={label}
                      />
                      {isRequired && <span className="text-xs">(Required)</span>}
                    </div>
                  </div>
                )}
              />
            );
          })}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
