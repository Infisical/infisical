import { useState } from "react";
import { Control, Controller, FieldPath, FieldValues } from "react-hook-form";

import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldError, TextArea } from "@app/components/v3";

/**
 * Textarea-backed editor for a list of IPs/CIDRs. The raw text lives in local state so partially
 * typed entries and blank lines survive re-renders, while the form only ever holds the parsed list.
 */
const CloudflareIpListInput = ({
  value,
  onChange
}: {
  value?: string[];
  onChange: (value: string[]) => void;
}) => {
  const [rawValue, setRawValue] = useState((value ?? []).join("\n"));

  return (
    <TextArea
      rows={4}
      value={rawValue}
      onChange={(e) => {
        setRawValue(e.target.value);
        onChange(
          e.target.value
            .split(/[\n,]/)
            .map((entry) => entry.trim())
            .filter(Boolean)
        );
      }}
      placeholder={"199.27.128.0/21\n2400:cb00::/32"}
      className="resize-none bg-container font-mono text-sm"
    />
  );
};

/** The labelled, form-wired version — shared by every Cloudflare rotation with IP restrictions. */
export const CloudflareIpListField = <T extends FieldValues>({
  control,
  name,
  label,
  tooltipText
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  tooltipText: string;
}) => (
  <Controller
    control={control}
    name={name}
    render={({ field: { value, onChange }, fieldState: { error } }) => (
      <Field data-invalid={Boolean(error)}>
        <FieldLabelWithTooltip tooltip={tooltipText}>
          {label} <span className="font-normal text-muted">(optional)</span>
        </FieldLabelWithTooltip>
        <CloudflareIpListInput value={value} onChange={onChange} />
        <FieldError>{error?.message}</FieldError>
      </Field>
    )}
  />
);
