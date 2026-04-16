import { cn } from "@app/components/v3/utils";

import type { DateRangeFilterAccent, DateRangeFilterResult } from "./DateRangeFilter";
import { ACCENT_STYLES } from "./DateRangeFilter";

export type QuickPreset = {
  label: string;
  value: string;
  resolve: () => { startDate: Date; endDate: Date };
};

export const DEFAULT_QUICK_PRESETS: QuickPreset[] = [
  {
    label: "5m",
    value: "5m",
    resolve: () => ({ startDate: new Date(Date.now() - 5 * 60 * 1000), endDate: new Date() })
  },
  {
    label: "30m",
    value: "30m",
    resolve: () => ({ startDate: new Date(Date.now() - 30 * 60 * 1000), endDate: new Date() })
  },
  {
    label: "1h",
    value: "1h",
    resolve: () => ({ startDate: new Date(Date.now() - 60 * 60 * 1000), endDate: new Date() })
  },
  {
    label: "3h",
    value: "3h",
    resolve: () => ({ startDate: new Date(Date.now() - 3 * 60 * 60 * 1000), endDate: new Date() })
  },
  {
    label: "12h",
    value: "12h",
    resolve: () => ({
      startDate: new Date(Date.now() - 12 * 60 * 60 * 1000),
      endDate: new Date()
    })
  }
];

type Props = {
  value?: string;
  onChange: (presetValue: string, result: DateRangeFilterResult) => void;
  presets?: QuickPreset[];
  isUtc?: boolean;
  accent?: DateRangeFilterAccent;
  hasTrailingItem?: boolean;
  className?: string;
};

export function DateRangeQuickPresets({
  value,
  onChange,
  presets = DEFAULT_QUICK_PRESETS,
  isUtc = false,
  accent = "primary",
  hasTrailingItem = false,
  className
}: Props) {
  const accentStyles = ACCENT_STYLES[accent];

  return (
    <div className={cn("flex items-center", className)}>
      {presets.map((preset, index) => {
        const isActive = value === preset.value;
        const isFirst = index === 0;
        const isLast = index === presets.length - 1 && !hasTrailingItem;
        return (
          <button
            key={preset.value}
            type="button"
            onClick={() => {
              const { startDate, endDate } = preset.resolve();
              onChange(preset.value, { startDate, endDate, isUtc });
            }}
            className={cn(
              "-ml-px w-11 border py-1.5 text-center text-xs font-medium transition-colors",
              isFirst && "rounded-l-md",
              isLast && "rounded-r-md",
              isActive
                ? `relative z-10 ${accentStyles.selectedChip}`
                : "text-muted-foreground border-border hover:relative hover:z-10 hover:border-foreground/25 hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
