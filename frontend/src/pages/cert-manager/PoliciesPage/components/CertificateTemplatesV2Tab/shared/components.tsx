import { Button } from "@app/components/v2";

import {
  EXTENDED_KEY_USAGES,
  formatUsageName,
  getUsageState,
  KEY_USAGES,
  toggleUsageState
} from "./utils";

type UsageToggleProps = {
  value: "required" | "optional" | undefined;
  onChange: (value: "required" | "optional" | undefined) => void;
};

export const UsageToggle = ({ value, onChange }: UsageToggleProps) => {
  return (
    <div className="flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(value === "required" ? undefined : "required");
        }}
        size="xs"
        className={`${
          value === "required" ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        Required
      </Button>
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(value === "optional" ? undefined : "optional");
        }}
        size="xs"
        className={`${
          value === "optional" ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        Optional
      </Button>
    </div>
  );
};

type KeyUsagesSectionProps = {
  watchedKeyUsages?: {
    requiredUsages?: string[];
    optionalUsages?: string[];
  };
  watchedExtendedKeyUsages?: {
    requiredUsages?: string[];
    optionalUsages?: string[];
  };
  toggleKeyUsage: (usage: string, type: "required" | "optional") => void;
  toggleExtendedKeyUsage: (usage: string, type: "required" | "optional") => void;
};

export const KeyUsagesSection = ({
  watchedKeyUsages,
  watchedExtendedKeyUsages,
  toggleKeyUsage,
  toggleExtendedKeyUsage
}: KeyUsagesSectionProps) => {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-mineshaft-200">Key Usages</h3>
        <div className="grid grid-cols-2 gap-3">
          {KEY_USAGES.map((usage) => {
            const requiredUsages = Array.isArray(watchedKeyUsages?.requiredUsages)
              ? watchedKeyUsages.requiredUsages
              : [];
            const optionalUsages = Array.isArray(watchedKeyUsages?.optionalUsages)
              ? watchedKeyUsages.optionalUsages
              : [];

            const currentState = getUsageState(usage, requiredUsages, optionalUsages);

            return (
              <div key={usage} className="flex items-center justify-between p-2">
                <span className="text-sm capitalize text-mineshaft-300">
                  {formatUsageName(usage)}
                </span>
                <UsageToggle
                  value={currentState}
                  onChange={(newValue) => {
                    toggleUsageState(
                      usage,
                      newValue,
                      requiredUsages,
                      optionalUsages,
                      (u) => toggleKeyUsage(u, "required"),
                      (u) => toggleKeyUsage(u, "optional")
                    );
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-mineshaft-200">Extended Key Usages</h3>
        <div className="grid grid-cols-2 gap-3">
          {EXTENDED_KEY_USAGES.map((usage) => {
            const requiredUsages = Array.isArray(watchedExtendedKeyUsages?.requiredUsages)
              ? watchedExtendedKeyUsages.requiredUsages
              : [];
            const optionalUsages = Array.isArray(watchedExtendedKeyUsages?.optionalUsages)
              ? watchedExtendedKeyUsages.optionalUsages
              : [];

            const currentState = getUsageState(usage, requiredUsages, optionalUsages);

            return (
              <div key={usage} className="flex items-center justify-between p-2">
                <span className="text-sm capitalize text-mineshaft-300">
                  {formatUsageName(usage)}
                </span>
                <UsageToggle
                  value={currentState}
                  onChange={(newValue) => {
                    toggleUsageState(
                      usage,
                      newValue,
                      requiredUsages,
                      optionalUsages,
                      (u) => toggleExtendedKeyUsage(u, "required"),
                      (u) => toggleExtendedKeyUsage(u, "optional")
                    );
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
