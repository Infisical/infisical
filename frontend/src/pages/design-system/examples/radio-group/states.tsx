import { FieldDescription, FieldError } from "@app/components/v4/ui/field";
import { Label } from "@app/components/v4/ui/label";
import { RadioGroup, RadioGroupItem } from "@app/components/v4/ui/radio-group";

import { ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid>
      {[
        { id: "empty", name: "Empty choice", disabled: false, invalid: false },
        { id: "invalid", name: "Required choice", disabled: false, invalid: true },
        { id: "disabled", name: "Policy choice", disabled: true, invalid: false }
      ].map((item) => (
        <fieldset key={item.id} className="min-w-0 space-y-3">
          <legend className="text-sm">{item.name}</legend>
          <RadioGroup
            aria-label={item.name}
            disabled={item.disabled}
            aria-invalid={item.invalid || undefined}
            aria-describedby={item.invalid ? "radio-required-error" : undefined}
          >
            {["west", "east"].map((value) => (
              <div key={value} className="flex items-center gap-3">
                <RadioGroupItem
                  id={`radio-${item.id}-${value}`}
                  value={value}
                  aria-invalid={item.invalid || undefined}
                />
                <Label htmlFor={`radio-${item.id}-${value}`}>{value}</Label>
              </div>
            ))}
          </RadioGroup>
          {item.invalid && <FieldError id="radio-required-error">Choose a region.</FieldError>}
          {item.disabled && <FieldDescription>Region is managed by policy.</FieldDescription>}
        </fieldset>
      ))}
    </ExampleGrid>
  );
}
