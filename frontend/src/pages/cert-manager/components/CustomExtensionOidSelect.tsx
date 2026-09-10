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
  excludeOids?: string[];
};

export const CustomExtensionOidSelect = ({
  value,
  onChange,
  isError,
  className,
  placeholder = "Select or enter an OID",
  extraOptions,
  excludeOids
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
    const excluded = new Set((excludeOids ?? []).filter((oid) => oid !== value));
    const selectable = knownOptions.filter((option) => !excluded.has(option.oid));
    const candidate = typed.trim();
    if (
      !candidate ||
      excluded.has(candidate) ||
      selectable.some((option) => option.oid === candidate)
    ) {
      return selectable;
    }
    return [{ oid: candidate, isCustom: true }, ...selectable];
  }, [knownOptions, typed, excludeOids, value]);

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
        onValueChange={(option) => {
          setTyped("");
          onChange(option.oid);
        }}
        onClear={() => {
          setTyped("");
          onChange("");
        }}
        onInput={(event) => setTyped(event.currentTarget.value)}
        onBlur={() => {
          const candidate = typed.trim();
          setTyped("");
          if (!candidate || candidate === value) return;
          if ((excludeOids ?? []).includes(candidate)) return;
          onChange(candidate);
        }}
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
