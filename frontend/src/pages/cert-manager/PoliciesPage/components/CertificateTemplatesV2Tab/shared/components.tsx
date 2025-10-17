import React from "react";

import { Select, SelectItem } from "@app/components/v2";

import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  EXTENDED_KEY_USAGE_OPTIONS,
  formatExtendedKeyUsage,
  formatKeyUsage,
  KEY_USAGE_OPTIONS
} from "./certificate-constants";

type KeyUsagePolicy = "allow" | "require" | "deny";

interface KeyUsagesSectionProps {
  watchedKeyUsages: {
    requiredUsages: CertKeyUsageType[];
    optionalUsages: CertKeyUsageType[];
  };
  watchedExtendedKeyUsages: {
    requiredUsages: CertExtendedKeyUsageType[];
    optionalUsages: CertExtendedKeyUsageType[];
  };
  onKeyUsagesChange: (usages: {
    requiredUsages: CertKeyUsageType[];
    optionalUsages: CertKeyUsageType[];
  }) => void;
  onExtendedKeyUsagesChange: (usages: {
    requiredUsages: CertExtendedKeyUsageType[];
    optionalUsages: CertExtendedKeyUsageType[];
  }) => void;
}

export const KeyUsagesSection: React.FC<KeyUsagesSectionProps> = ({
  watchedKeyUsages,
  watchedExtendedKeyUsages,
  onKeyUsagesChange,
  onExtendedKeyUsagesChange
}) => {
  const getKeyUsagePolicy = (usage: CertKeyUsageType): KeyUsagePolicy => {
    if (watchedKeyUsages.requiredUsages.includes(usage)) return "require";
    if (watchedKeyUsages.optionalUsages.includes(usage)) return "allow";
    return "deny";
  };

  const getExtendedKeyUsagePolicy = (usage: CertExtendedKeyUsageType): KeyUsagePolicy => {
    if (watchedExtendedKeyUsages.requiredUsages.includes(usage)) return "require";
    if (watchedExtendedKeyUsages.optionalUsages.includes(usage)) return "allow";
    return "deny";
  };

  const handleKeyUsagePolicyChange = (usage: CertKeyUsageType, policy: KeyUsagePolicy) => {
    const newRequired = watchedKeyUsages.requiredUsages.filter((u) => u !== usage);
    const newOptional = watchedKeyUsages.optionalUsages.filter((u) => u !== usage);

    if (policy === "require") {
      newRequired.push(usage);
    } else if (policy === "allow") {
      newOptional.push(usage);
    }

    onKeyUsagesChange({
      requiredUsages: newRequired,
      optionalUsages: newOptional
    });
  };

  const handleExtendedKeyUsagePolicyChange = (
    usage: CertExtendedKeyUsageType,
    policy: KeyUsagePolicy
  ) => {
    const newRequired = watchedExtendedKeyUsages.requiredUsages.filter((u) => u !== usage);
    const newOptional = watchedExtendedKeyUsages.optionalUsages.filter((u) => u !== usage);

    if (policy === "require") {
      newRequired.push(usage);
    } else if (policy === "allow") {
      newOptional.push(usage);
    }

    onExtendedKeyUsagesChange({
      requiredUsages: newRequired,
      optionalUsages: newOptional
    });
  };

  const policyOptions = [
    { value: "deny", label: "Deny" },
    { value: "allow", label: "Allow" },
    { value: "require", label: "Require" }
  ];

  return (
    <div className="space-y-8">
      {/* Key Usages */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-bunker-200">Key Usages</h4>

        <div className="grid grid-cols-2 gap-4">
          {KEY_USAGE_OPTIONS.map((usage) => {
            const policy = getKeyUsagePolicy(usage);
            return (
              <div key={usage} className="flex items-center justify-between">
                <span className="text-sm text-bunker-200">{formatKeyUsage(usage)}</span>
                <Select
                  value={policy}
                  onValueChange={(value) =>
                    handleKeyUsagePolicyChange(usage, value as KeyUsagePolicy)
                  }
                  className="w-32"
                >
                  {policyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Extended Key Usages */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-bunker-200">Extended Key Usages</h4>

        <div className="grid grid-cols-2 gap-4">
          {EXTENDED_KEY_USAGE_OPTIONS.map((usage) => {
            const policy = getExtendedKeyUsagePolicy(usage);
            return (
              <div key={usage} className="flex items-center justify-between">
                <span className="text-sm text-bunker-200">{formatExtendedKeyUsage(usage)}</span>
                <Select
                  value={policy}
                  onValueChange={(value) =>
                    handleExtendedKeyUsagePolicyChange(usage, value as KeyUsagePolicy)
                  }
                  className="w-32"
                >
                  {policyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
