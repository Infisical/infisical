import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import { MfaMethod } from "@app/hooks/api/auth/types";

import { MFA_METHOD_OPTIONS } from "./types";

type Props = {
  selectedMethod: MfaMethod;
  onSelect: (method: MfaMethod) => void;
};

export const MethodStep = ({ selectedMethod, onSelect }: Props) => {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Choose the method you want to use as your second factor.</p>
      <RadioGroup
        value={selectedMethod}
        onValueChange={(value) => onSelect(value as MfaMethod)}
        className="gap-3"
      >
        {MFA_METHOD_OPTIONS.map((option) => {
          const Icon = option.icon;
          const id = `mfa-method-${option.value}`;
          return (
            <FieldLabel key={option.value} htmlFor={id}>
              <Field orientation="horizontal">
                <Icon />
                <FieldContent>
                  <FieldTitle>{option.label}</FieldTitle>
                  <FieldDescription>{option.description}</FieldDescription>
                </FieldContent>
                <RadioGroupItem value={option.value} id={id} />
              </Field>
            </FieldLabel>
          );
        })}
      </RadioGroup>
    </div>
  );
};
