import * as React from "react";

import { FieldControlContext, useFieldControlAttributes } from "../lib/field-context";
import { Input } from "./input";
import { Select } from "./select";

import styles from "./duration-input.module.css";

const DURATION_UNITS = [
  { value: "s", label: "Seconds", milliseconds: 1_000 },
  { value: "m", label: "Minutes", milliseconds: 60_000 },
  { value: "h", label: "Hours", milliseconds: 3_600_000 },
  { value: "d", label: "Days", milliseconds: 86_400_000 },
  { value: "w", label: "Weeks", milliseconds: 604_800_000 }
] as const;

export type DurationUnit = (typeof DURATION_UNITS)[number]["value"];

const parseDuration = (value: string) => {
  const explicit = value.trim().match(/^(\d+(?:\.\d+)?)\s*([smhdw])$/i);
  if (explicit) return { amount: explicit[1], unit: explicit[2].toLowerCase() as DurationUnit };
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const milliseconds = Number(value);
  const unit = [...DURATION_UNITS]
    .reverse()
    .find((option) => milliseconds % option.milliseconds === 0);
  if (unit) return { amount: String(milliseconds / unit.milliseconds), unit: unit.value };
  return { amount: String(milliseconds / 1_000), unit: "s" as const };
};

export type DurationInputProps = {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

/**
 * An amount and a unit that read and emit the ms() string main sends for access durations:
 * the amount followed by s, m, h, d or w ("1h", "1.5d"), or "" when the amount is cleared.
 */
export function DurationInput({
  value,
  onChange,
  invalid,
  disabled,
  placeholder,
  ref,
  ...props
}: DurationInputProps & { ref?: React.Ref<HTMLInputElement> }) {
  const field = useFieldControlAttributes(props);
  const unitLabelId = React.useId();
  const parsed = parseDuration(value);
  const [pendingUnit, setPendingUnit] = React.useState<DurationUnit>("h");
  const unit = parsed?.unit ?? pendingUnit;
  const amount = parsed?.amount ?? "";
  const label = props["aria-label"] ?? (field["aria-labelledby"] ? undefined : "Duration");
  const labelledBy = label ? undefined : field["aria-labelledby"];
  return (
    <FieldControlContext value={{}}>
      <div
        role="group"
        data-slot="duration-input"
        aria-label={label}
        aria-labelledby={labelledBy}
        className={styles.durationInput}
      >
        <Input
          ref={ref}
          id={field.id}
          type="number"
          inputMode="decimal"
          min="0.001"
          step="any"
          value={amount}
          placeholder={placeholder}
          disabled={disabled}
          invalid={invalid || Boolean(field["aria-invalid"])}
          aria-label={label}
          aria-labelledby={labelledBy}
          aria-describedby={field["aria-describedby"]}
          onChange={(event) => onChange(event.target.value ? `${event.target.value}${unit}` : "")}
        />
        <Select
          value={unit}
          disabled={disabled}
          invalid={invalid || Boolean(field["aria-invalid"])}
          options={DURATION_UNITS.map(({ value: option, label: optionLabel }) => ({
            value: option,
            label: optionLabel
          }))}
          aria-label={label ? `${label} unit` : undefined}
          aria-labelledby={labelledBy ? `${labelledBy} ${unitLabelId}` : undefined}
          onChange={(next) => {
            setPendingUnit(next as DurationUnit);
            if (amount) onChange(`${amount}${next}`);
          }}
        />
        {labelledBy && (
          <span id={unitLabelId} hidden>
            unit
          </span>
        )}
      </div>
    </FieldControlContext>
  );
}
DurationInput.displayName = "DurationInput";
