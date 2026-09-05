import { useMemo, useState } from "react";

import { Combobox } from "@app/components/v3";
import { CUSTOM_EXTENSION_PRESETS } from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

type TOidOption = { oid: string; name?: string; isCustom?: boolean };

const OID_OPTIONS: TOidOption[] = Object.entries(CUSTOM_EXTENSION_PRESETS).map(([oid, preset]) => ({
  oid,
  name: preset.label
}));

type Props = {
  value: string;
  onChange: (oid: string) => void;
  isError?: boolean;
  className?: string;
  placeholder?: string;
  extraOptions?: TOidOption[];
};

export const CustomExtensionOidSelect = ({
  value,
  onChange,
  isError,
  className,
  placeholder = "Select or enter an OID",
  extraOptions
}: Props) => {
  const [typed, setTyped] = useState("");

  const knownOptions = useMemo(() => {
    if (!extraOptions?.length) return OID_OPTIONS;
    const byOid = new Map(OID_OPTIONS.map((option) => [option.oid, option]));
    extraOptions.forEach((option) => {
      byOid.set(option.oid, { ...byOid.get(option.oid), ...option });
    });
    return [...byOid.values()];
  }, [extraOptions]);

  const options = useMemo(() => {
    const candidate = typed.trim();
    if (!candidate || knownOptions.some((option) => option.oid === candidate)) return knownOptions;
    return [{ oid: candidate, isCustom: true }, ...knownOptions];
  }, [knownOptions, typed]);

  const selected = useMemo(() => {
    if (!value) return null;
    return knownOptions.find((option) => option.oid === value) ?? { oid: value };
  }, [knownOptions, value]);

  return (
    <div className={className}>
      <Combobox<TOidOption>
        aria-label="Object identifier"
        placeholder={placeholder}
        searchPlaceholder="Select or enter an OID"
        emptyMessage="Enter an OID"
        options={options}
        value={selected}
        onValueChange={(option) => onChange(option.oid)}
        onClear={() => onChange("")}
        onInput={(event) => setTyped(event.currentTarget.value)}
        getOptionValue={(option) => option.oid}
        getOptionLabel={(option) => option.oid}
        getOptionKeywords={(option) => (option.name ? [option.name] : [])}
        renderValue={(option) => <span className="font-mono text-xs">{option.oid}</span>}
        renderOption={(option) => (
          <div>
            <p className="font-mono text-xs">{option.oid}</p>
            <p className="text-xs text-muted">{option.isCustom ? "Use this OID" : option.name}</p>
          </div>
        )}
        isError={isError}
      />
    </div>
  );
};
