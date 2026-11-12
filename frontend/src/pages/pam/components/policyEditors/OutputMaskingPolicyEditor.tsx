import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  TextArea
} from "@app/components/v3";
import { PamOutputMaskingPreset } from "@app/hooks/api/pam";

import { PolicyEditorProps } from "./types";

const PRESETS: { key: PamOutputMaskingPreset; label: string; example: string }[] = [
  { key: PamOutputMaskingPreset.Email, label: "Email Addresses", example: "jane@acme.com" },
  { key: PamOutputMaskingPreset.PhoneNumber, label: "Phone Numbers", example: "(555) 123-4567" },
  { key: PamOutputMaskingPreset.Ssn, label: "Social Security Numbers", example: "123-45-6789" },
  {
    key: PamOutputMaskingPreset.CreditCard,
    label: "Credit Card Numbers",
    example: "4111 1111 1111 1111"
  },
  { key: PamOutputMaskingPreset.IpAddress, label: "IP Addresses", example: "192.168.1.10" },
  { key: PamOutputMaskingPreset.Jwt, label: "JSON Web Tokens", example: "eyJhbGciOiJIUzI1NiJ9…" }
];

type TOutputMasking = { presets: PamOutputMaskingPreset[]; patterns: string };

const parseValue = (value: unknown): TOutputMasking => {
  const masking = (value ?? {}) as Partial<TOutputMasking>;
  return {
    presets: Array.isArray(masking.presets) ? masking.presets : [],
    patterns: typeof masking.patterns === "string" ? masking.patterns : ""
  };
};

export const OutputMaskingPolicyEditor = ({
  label,
  description,
  value,
  onChange
}: PolicyEditorProps) => {
  const { presets, patterns } = parseValue(value);

  const update = (next: TOutputMasking) =>
    onChange(next.presets.length > 0 || next.patterns.trim() ? next : null);

  return (
    <Field>
      <FieldContent>
        <FieldTitle>{label}</FieldTitle>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Field>
        <FieldLabel htmlFor="output-masking-presets">Presets</FieldLabel>
        <Combobox
          id="output-masking-presets"
          multiple
          options={PRESETS}
          value={PRESETS.filter((preset) => presets.includes(preset.key))}
          onValueChange={(options) =>
            update({ patterns, presets: options.map((option) => option.key) })
          }
          getOptionValue={(option) => option.key}
          getOptionLabel={(option) => option.label}
          renderOption={(option) => (
            <div className="flex min-w-0 items-center justify-between gap-4">
              <span className="truncate">{option.label}</span>
              <span className="shrink-0 font-mono text-xs text-muted">{option.example}</span>
            </div>
          )}
          placeholder="Select presets..."
          searchAriaLabel="Search presets"
          clearAriaLabel="Clear all presets"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="output-masking-patterns">Custom Patterns</FieldLabel>
        <TextArea
          id="output-masking-patterns"
          rows={3}
          placeholder={"acme_[a-z0-9]{24}\ninternal-vault://\\S+"}
          value={patterns}
          onChange={(e) => update({ presets, patterns: e.target.value })}
        />
        <FieldDescription>
          One regex per line, masked in addition to the presets above.
        </FieldDescription>
      </Field>
    </Field>
  );
};
