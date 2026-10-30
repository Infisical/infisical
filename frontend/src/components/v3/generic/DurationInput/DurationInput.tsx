import * as React from "react";

import { cn } from "../../utils";
import { Input } from "../Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../Select";

const DURATION_UNITS = [
  { value: "s", label: "Seconds", milliseconds: 1_000 },
  { value: "m", label: "Minutes", milliseconds: 60_000 },
  { value: "h", label: "Hours", milliseconds: 3_600_000 },
  { value: "d", label: "Days", milliseconds: 86_400_000 },
  { value: "w", label: "Weeks", milliseconds: 604_800_000 }
] as const;

const DEFAULT_DURATION_UNITS = DURATION_UNITS.map(({ value }) => value);

export type DurationUnit = (typeof DURATION_UNITS)[number]["value"];

type DurationInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "onChange" | "type" | "value"
> & {
  value?: string;
  onValueChange: (value: string) => void;
  units?: readonly DurationUnit[];
  defaultUnit?: DurationUnit;
  unitAriaLabel?: string;
};

const parseDuration = (value: string | undefined) => {
  if (!value) return null;

  const explicitDuration = value.trim().match(/^(\d+(?:\.\d+)?)\s*([smhdw])$/i);
  if (explicitDuration) {
    return {
      amount: explicitDuration[1],
      unit: explicitDuration[2].toLowerCase() as DurationUnit
    };
  }

  // Preserve compatibility with legacy bare values, which the API interpreted as milliseconds.
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return null;

  const milliseconds = Number(value);
  const unit = [...DURATION_UNITS]
    .reverse()
    .find(({ milliseconds: unitMilliseconds }) => milliseconds % unitMilliseconds === 0);

  if (unit) return { amount: String(milliseconds / unit.milliseconds), unit: unit.value };

  return { amount: String(milliseconds / 1_000), unit: "s" as const };
};

export const DurationInput = React.forwardRef<HTMLInputElement, DurationInputProps>(
  (
    {
      value = "",
      onValueChange,
      units = DEFAULT_DURATION_UNITS,
      defaultUnit = "h",
      unitAriaLabel = "Duration unit",
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const parsedDuration = parseDuration(value);
    const initialUnit =
      parsedDuration && units.includes(parsedDuration.unit) ? parsedDuration.unit : defaultUnit;
    const [unit, setUnit] = React.useState<DurationUnit>(initialUnit);

    React.useEffect(() => {
      if (parsedDuration && units.includes(parsedDuration.unit)) setUnit(parsedDuration.unit);
    }, [parsedDuration?.unit, units]);

    const amount = parsedDuration?.amount ?? "";

    return (
      <div className={cn("grid grid-cols-[minmax(0,1fr)_9rem] gap-2", className)}>
        <Input
          ref={ref}
          type="number"
          inputMode="decimal"
          min="0.001"
          step="any"
          value={amount}
          disabled={disabled}
          onChange={(event) => {
            onValueChange(event.target.value ? `${event.target.value}${unit}` : "");
          }}
          {...props}
        />
        <Select
          value={unit}
          disabled={disabled}
          onValueChange={(nextUnit) => {
            const selectedUnit = nextUnit as DurationUnit;
            setUnit(selectedUnit);
            if (amount) onValueChange(`${amount}${selectedUnit}`);
          }}
        >
          <SelectTrigger aria-label={unitAriaLabel} className="w-full" isError={props.isError}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {DURATION_UNITS.filter(({ value: optionUnit }) => units.includes(optionUnit)).map(
              ({ value: optionUnit, label }) => (
                <SelectItem key={optionUnit} value={optionUnit}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>
    );
  }
);

DurationInput.displayName = "DurationInput";
