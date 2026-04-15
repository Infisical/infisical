import { useEffect, useMemo, useState } from "react";
import { type DateRange } from "react-day-picker";
import { addMonths, format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import ms from "ms";

import { cn } from "@app/components/v3/utils";

import { Button } from "../Button";
import { Calendar } from "../Calendar";
import { UnstableInput } from "../Input";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../Select";
import { Switch } from "../Switch";

const RELATIVE_PRESETS = [
  { value: "5m", label: "5 minutes" },
  { value: "30m", label: "30 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "3h", label: "3 hours" },
  { value: "12h", label: "12 hours" }
] as const;

const RELATIVE_OPTIONS = [
  { label: "Minutes", unit: "m", values: [5, 10, 15, 30, 45] },
  { label: "Hours", unit: "h", values: [1, 2, 3, 6, 8, 12] },
  { label: "Days", unit: "d", values: [1, 2, 3, 4, 5, 6] },
  { label: "Weeks", unit: "w", values: [1, 2, 3, 4] }
] as const;

export enum DateRangeFilterType {
  Last = "last",
  Fixed = "fixed"
}

export type DateRangeFilterValue =
  | { type: DateRangeFilterType.Last; value: string }
  | { type: DateRangeFilterType.Fixed; startDate: Date; endDate: Date };

export type DateRangeFilterResult = {
  startDate: Date;
  endDate: Date;
  isUtc: boolean;
};

type DateRangeFilterAccent = "primary" | "secondary";

type Props = {
  defaultValue?: DateRangeFilterValue;
  defaultIsUtc?: boolean;
  onChange: (value: DateRangeFilterResult) => void;
  accent?: DateRangeFilterAccent;
  className?: string;
};

const ACCENT_STYLES: Record<
  DateRangeFilterAccent,
  {
    selectedBorderBg: string;
    selectedCard: string;
    selectedBadge: string;
    selectedChip: string;
    switchChecked: string;
  }
> = {
  primary: {
    selectedBorderBg: "border-primary bg-primary/10",
    selectedCard: "border-primary/40 bg-primary/10 shadow-xs",
    selectedBadge: "rounded-sm bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary",
    selectedChip: "border-primary/40 bg-primary/10 text-foreground",
    switchChecked:
      "data-[state=checked]:border-primary/25 data-[state=checked]:bg-primary/10 data-[state=checked]:hover:border-primary/30 data-[state=checked]:hover:bg-primary/15"
  },
  secondary: {
    selectedBorderBg: "border-org bg-org/10",
    selectedCard: "border-org/40 bg-org/10 shadow-xs",
    selectedBadge: "rounded-sm bg-org/10 px-1.5 py-0.5 text-[11px] font-medium text-org",
    selectedChip: "border-org/40 bg-org/10 text-foreground",
    switchChecked:
      "data-[state=checked]:border-org/25 data-[state=checked]:bg-org/10 data-[state=checked]:hover:border-org/30 data-[state=checked]:hover:bg-org/15"
  }
};

function formatDateForDisplay(date: Date, isUtc: boolean): string {
  if (isUtc) {
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return format(utcDate, "MMM d, yyyy HH:mm");
  }
  return format(date, "MMM d, yyyy HH:mm");
}

function formatTriggerLabel(value: DateRangeFilterValue, isUtc: boolean): string {
  if (value.type === DateRangeFilterType.Last) return `Last ${value.value}`;
  const start = formatDateForDisplay(value.startDate, isUtc);
  const end = formatDateForDisplay(value.endDate, isUtc);
  return `${start} — ${end}`;
}

function combineDateAndTime(date: Date, timeStr: string): Date {
  const [hoursStr, minutesStr] = timeStr.split(":");
  const result = new Date(date);
  result.setHours(Number(hoursStr) || 0, Number(minutesStr) || 0, 0, 0);
  return result;
}

function toTimeString(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function isValidLastValue(val: string): boolean {
  const parsed = ms(val);
  return typeof parsed === "number" && parsed > 0;
}

function resolveDateRange(value: DateRangeFilterValue, isUtc: boolean): DateRangeFilterResult {
  if (value.type === DateRangeFilterType.Last) {
    const now = new Date();
    return {
      startDate: new Date(now.getTime() - ms(value.value)),
      endDate: now,
      isUtc
    };
  }

  return {
    startDate: value.startDate,
    endDate: value.endDate,
    isUtc
  };
}

export function DateRangeFilter({
  defaultValue,
  defaultIsUtc = false,
  onChange,
  accent = "primary",
  className
}: Props) {
  const initialValue = defaultValue ?? { type: DateRangeFilterType.Last, value: "1h" };
  const [appliedValue, setAppliedValue] = useState<DateRangeFilterValue>(initialValue);
  const [appliedIsUtc, setAppliedIsUtc] = useState(defaultIsUtc);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<DateRangeFilterType>(
    initialValue.type === DateRangeFilterType.Fixed
      ? DateRangeFilterType.Fixed
      : DateRangeFilterType.Last
  );

  // Last mode state
  const [selectedLastValue, setSelectedLastValue] = useState<string>(
    initialValue.type === DateRangeFilterType.Last ? initialValue.value : "1h"
  );
  const [customDuration, setCustomDuration] = useState<string>("");
  const [customUnit, setCustomUnit] = useState<string>("m");

  // Fixed mode state
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(
    initialValue.type === DateRangeFilterType.Fixed
      ? { from: initialValue.startDate, to: initialValue.endDate }
      : undefined
  );
  const [startTime, setStartTime] = useState<string>(
    initialValue.type === DateRangeFilterType.Fixed ? toTimeString(initialValue.startDate) : "00:00"
  );
  const [endTime, setEndTime] = useState<string>(
    initialValue.type === DateRangeFilterType.Fixed ? toTimeString(initialValue.endDate) : "23:59"
  );

  // Timezone state
  const [pendingIsUtc, setPendingIsUtc] = useState(defaultIsUtc);

  // Sync pending state when popover opens
  useEffect(() => {
    if (isOpen) {
      setMode(
        appliedValue.type === DateRangeFilterType.Fixed
          ? DateRangeFilterType.Fixed
          : DateRangeFilterType.Last
      );
      setPendingIsUtc(appliedIsUtc);
      if (appliedValue.type === DateRangeFilterType.Last) {
        setSelectedLastValue(appliedValue.value);
        setCustomDuration("");
        setCustomUnit("m");
      } else {
        setPendingRange({ from: appliedValue.startDate, to: appliedValue.endDate });
        setStartTime(toTimeString(appliedValue.startDate));
        setEndTime(toTimeString(appliedValue.endDate));
      }
    }
  }, [isOpen, appliedValue, appliedIsUtc]);

  const handleApply = () => {
    let nextValue: DateRangeFilterValue;
    if (mode === DateRangeFilterType.Last) {
      const lastVal =
        customDuration && customUnit ? `${customDuration}${customUnit}` : selectedLastValue;
      if (!isValidLastValue(lastVal)) return;
      nextValue = { type: DateRangeFilterType.Last, value: lastVal };
    } else {
      if (!pendingRange?.from || !pendingRange?.to) return;
      const startDate = combineDateAndTime(pendingRange.from, startTime);
      const endDate = combineDateAndTime(pendingRange.to, endTime);
      nextValue = { type: DateRangeFilterType.Fixed, startDate, endDate };
    }

    setAppliedValue(nextValue);
    setAppliedIsUtc(pendingIsUtc);
    onChange(resolveDateRange(nextValue, pendingIsUtc));
    setIsOpen(false);
  };

  const today = new Date();

  const calendarDefaultMonth = pendingRange?.from ? pendingRange.from : addMonths(today, -1);

  const isApplyDisabled =
    mode === DateRangeFilterType.Fixed ? !pendingRange?.from || !pendingRange?.to : false;

  const activeLastValue = customDuration && customUnit ? "" : selectedLastValue;
  const accentStyles = ACCENT_STYLES[accent];
  const selectedCustomUnit = useMemo(
    () => RELATIVE_OPTIONS.find((opt) => opt.unit === customUnit),
    [customUnit]
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-1.5 font-normal", className)}>
          <CalendarIcon className="text-muted-foreground size-3.5 shrink-0" />
          <span className="max-w-72 truncate">
            {formatTriggerLabel(appliedValue, appliedIsUtc)}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-auto min-w-80 overflow-hidden p-0">
        <div className="flex flex-col">
          {/* Body */}
          <div className="flex">
            {/* Left sidebar */}
            <div className="flex w-24 shrink-0 flex-col border-r border-border py-2">
              {[DateRangeFilterType.Last, DateRangeFilterType.Fixed].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "border-l-2 px-3 py-2 text-left text-sm transition-colors",
                    mode === m
                      ? `${accentStyles.selectedBorderBg} font-medium text-foreground`
                      : "text-muted-foreground border-transparent hover:bg-foreground/5 hover:text-foreground"
                  )}
                >
                  {m === DateRangeFilterType.Last ? "Last" : "Fixed"}
                </button>
              ))}
            </div>

            {/* Right content */}
            <div className="flex-1 p-4">
              {mode === DateRangeFilterType.Last && (
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        Quick ranges
                      </span>
                      {!!activeLastValue && (
                        <span className={accentStyles.selectedBadge}>{activeLastValue}</span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {RELATIVE_PRESETS.map(({ value: val, label }) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setSelectedLastValue(val);
                            setCustomDuration("");
                          }}
                          className={cn(
                            "group rounded-md border px-3 py-2 text-left transition-all",
                            activeLastValue === val
                              ? accentStyles.selectedCard
                              : "border-border bg-background hover:border-foreground/25 hover:bg-foreground/5"
                          )}
                        >
                          <span
                            className={cn(
                              "block text-sm leading-none",
                              activeLastValue === val
                                ? "font-medium text-foreground"
                                : "text-foreground/90"
                            )}
                          >
                            {label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-foreground/[0.02] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        Custom
                      </span>
                      {customDuration && (
                        <span className={accentStyles.selectedBadge}>
                          {customDuration}
                          {customUnit}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <UnstableInput
                        type="number"
                        placeholder="Amount"
                        className="h-8 w-24 text-xs"
                        min={1}
                        value={customDuration}
                        onChange={(e) => {
                          setCustomDuration(e.target.value);
                          if (e.target.value) setSelectedLastValue("");
                        }}
                      />
                      <Select value={customUnit} onValueChange={setCustomUnit}>
                        <SelectTrigger size="sm" className="h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RELATIVE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.unit} value={opt.unit}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedCustomUnit?.values.map((val) => {
                        const isActive = customDuration === String(val);
                        return (
                          <button
                            key={`${selectedCustomUnit.unit}-${val}`}
                            type="button"
                            onClick={() => {
                              setCustomDuration(String(val));
                              setSelectedLastValue("");
                            }}
                            className={cn(
                              "rounded-md border px-2 py-1 text-xs transition-colors",
                              isActive
                                ? accentStyles.selectedChip
                                : "text-muted-foreground border-border hover:border-foreground/25 hover:bg-foreground/5 hover:text-foreground"
                            )}
                          >
                            {val}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {mode === DateRangeFilterType.Fixed && (
                <div className="flex flex-col gap-3">
                  {/* Calendar */}
                  <Calendar
                    mode="range"
                    selected={pendingRange}
                    onSelect={setPendingRange}
                    numberOfMonths={2}
                    captionLayout="dropdown"
                    disabled={{ after: today }}
                    defaultMonth={calendarDefaultMonth}
                    startMonth={addMonths(today, -120)}
                    endMonth={today}
                    className="p-0"
                    classNames={{ announcement: "sr-only" }}
                  />

                  {/* Time inputs */}
                  <div className="flex items-end gap-4 border-t border-border pt-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs">Start Time</span>
                      <UnstableInput
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="h-8 text-sm scheme-dark [&::-webkit-calendar-picker-indicator]:hidden"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs">End Time</span>
                      <UnstableInput
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="h-8 text-sm scheme-dark [&::-webkit-calendar-picker-indicator]:hidden"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
            {mode === DateRangeFilterType.Fixed ? (
              <div className="flex shrink-0 cursor-pointer items-center gap-2 select-none">
                <span
                  className={cn(
                    "text-sm transition-colors",
                    !pendingIsUtc ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  Local
                </span>
                <Switch
                  id="date-range-utc-toggle"
                  checked={pendingIsUtc}
                  onCheckedChange={setPendingIsUtc}
                  size="sm"
                  className={accentStyles.switchChecked}
                />
                {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                <label
                  htmlFor="date-range-utc-toggle"
                  className={cn(
                    "cursor-pointer text-sm transition-colors",
                    pendingIsUtc ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  UTC
                </label>
              </div>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                isDisabled={isApplyDisabled}
                onClick={handleApply}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
