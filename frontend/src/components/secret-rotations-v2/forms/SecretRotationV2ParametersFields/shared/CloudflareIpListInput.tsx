import { useState } from "react";

import { TextArea } from "@app/components/v2";

/**
 * Textarea-backed editor for a list of IPs/CIDRs. The raw text lives in local state so partially
 * typed entries and blank lines survive re-renders, while the form only ever holds the parsed list.
 */
export const CloudflareIpListInput = ({
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
