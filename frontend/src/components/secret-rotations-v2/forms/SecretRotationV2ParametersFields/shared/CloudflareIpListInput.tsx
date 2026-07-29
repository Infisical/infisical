import { useState } from "react";
import { Control, Controller, FieldPath, FieldValues } from "react-hook-form";

import { FormControl, TextArea } from "@app/components/v2";

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
      reSize="none"
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
      className="border-mineshaft-600 bg-mineshaft-900 font-mono text-sm"
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
      <FormControl
        isOptional
        isError={Boolean(error)}
        errorText={error?.message}
        label={label}
        tooltipText={tooltipText}
      >
        <CloudflareIpListInput value={value} onChange={onChange} />
      </FormControl>
    )}
  />
);
