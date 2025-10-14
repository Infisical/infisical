import { Checkbox } from "@app/components/v2";

import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  formatExtendedKeyUsage,
  formatKeyUsage,
  EXTENDED_KEY_USAGE_OPTIONS,
  KEY_USAGE_OPTIONS
} from "./certificate-constants";

type UsageState = "mandatory" | "optional" | undefined;

type ThreeStateCheckboxProps = {
  value: UsageState;
  onChange: (newValue: UsageState) => void;
  label: string;
  id: string;
};

const ThreeStateCheckbox = ({ value, onChange, label, id }: ThreeStateCheckboxProps) => {
  const handleClick = () => {
    if (value === undefined) {
      onChange("optional");
    } else if (value === "optional") {
      onChange("mandatory");
    } else {
      onChange(undefined);
    }
  };

  const getCheckboxState = () => {
    if (value) return true;
    return false;
  };

  const getIndeterminateState = () => {
    return value === "optional";
  };

  const getStateLabel = () => {
    if (value === "mandatory") return " (Mandatory)";
    if (value === "optional") return " (Optional)";
    return "";
  };

  return (
    <div className="flex items-center space-x-3">
      <Checkbox
        id={id}
        isChecked={getCheckboxState()}
        isIndeterminate={getIndeterminateState()}
        onCheckedChange={handleClick}
      />
      <label
        htmlFor={id}
        className="text-mineshaft-200 cursor-pointer text-sm font-medium"
      >
        {label}
        {value && (
          <span className="text-mineshaft-400 text-xs ml-1">
            {getStateLabel()}
          </span>
        )}
      </label>
    </div>
  );
};

type KeyUsagesSectionProps = {
  watchedKeyUsages?: { requiredUsages?: string[]; optionalUsages?: string[] };
  watchedExtendedKeyUsages?: { requiredUsages?: string[]; optionalUsages?: string[] };
  onKeyUsagesChange: (usages: { requiredUsages: string[]; optionalUsages: string[] }) => void;
  onExtendedKeyUsagesChange: (usages: { requiredUsages: string[]; optionalUsages: string[] }) => void;
};

export const KeyUsagesSection = ({
  watchedKeyUsages = { requiredUsages: [], optionalUsages: [] },
  watchedExtendedKeyUsages = { requiredUsages: [], optionalUsages: [] },
  onKeyUsagesChange,
  onExtendedKeyUsagesChange
}: KeyUsagesSectionProps) => {
  const getUsageState = (usage: string, data: { requiredUsages?: string[]; optionalUsages?: string[] }): UsageState => {
    if (data.requiredUsages?.includes(usage)) return "mandatory";
    if (data.optionalUsages?.includes(usage)) return "optional";
    return undefined;
  };

  const handleKeyUsageChange = (usage: CertKeyUsageType, newState: UsageState) => {
    const currentRequired = watchedKeyUsages.requiredUsages || [];
    const currentOptional = watchedKeyUsages.optionalUsages || [];

    let newRequired = currentRequired.filter(u => u !== usage);
    let newOptional = currentOptional.filter(u => u !== usage);

    if (newState === "mandatory") {
      newRequired = [...newRequired, usage];
    } else if (newState === "optional") {
      newOptional = [...newOptional, usage];
    }

    onKeyUsagesChange({ requiredUsages: newRequired, optionalUsages: newOptional });
  };

  const handleExtendedKeyUsageChange = (usage: CertExtendedKeyUsageType, newState: UsageState) => {
    const currentRequired = watchedExtendedKeyUsages.requiredUsages || [];
    const currentOptional = watchedExtendedKeyUsages.optionalUsages || [];

    let newRequired = currentRequired.filter(u => u !== usage);
    let newOptional = currentOptional.filter(u => u !== usage);

    if (newState === "mandatory") {
      newRequired = [...newRequired, usage];
    } else if (newState === "optional") {
      newOptional = [...newOptional, usage];
    }

    onExtendedKeyUsagesChange({ requiredUsages: newRequired, optionalUsages: newOptional });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-mineshaft-200 text-sm font-medium">Key Usages</h3>
        <div className="grid grid-cols-2 gap-2 pl-2">
          {KEY_USAGE_OPTIONS.map((usage) => (
            <ThreeStateCheckbox
              key={usage}
              id={`key-usage-${usage}`}
              label={formatKeyUsage(usage)}
              value={getUsageState(usage, watchedKeyUsages)}
              onChange={(newState) => handleKeyUsageChange(usage, newState)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-mineshaft-200 text-sm font-medium">Extended Key Usages</h3>
        <div className="grid grid-cols-2 gap-2 pl-2">
          {EXTENDED_KEY_USAGE_OPTIONS.map((usage) => (
            <ThreeStateCheckbox
              key={usage}
              id={`ext-key-usage-${usage}`}
              label={formatExtendedKeyUsage(usage)}
              value={getUsageState(usage, watchedExtendedKeyUsages)}
              onChange={(newState) => handleExtendedKeyUsageChange(usage, newState)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
