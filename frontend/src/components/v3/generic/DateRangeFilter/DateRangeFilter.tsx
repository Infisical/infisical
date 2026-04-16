import { useEffect, useMemo, useState } from "react";
import { type DateRange } from "react-day-picker";
import { addDays, addMonths, format, subMonths } from "date-fns";
import { ArrowRight, CalendarIcon } from "lucide-react";
import ms from "ms";

import { cn } from "@app/components/v3/utils";

import { Button, type ButtonProps } from "../Button";
import { Calendar, CalendarDayButton } from "../Calendar";
import { UnstableInput } from "../Input";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../Select";
import { Switch } from "../Switch";

const MAX_RANGE_MONTHS = 3;

const SECONDARY_PRESETS = [
  { value: "1d", label: "1 day" },
  { value: "2d", label: "2 days" },
  { value: "1w", label: "1 week" },
  { value: "2w", label: "2 weeks" },
  { value: "1M", label: "1 month" },
  { value: "3M", label: "3 months" }
] as const;

const RELATIVE_OPTIONS = [
  { label: "Minutes", unit: "m", values: [5, 10, 15, 30, 45] },
  { label: "Hours", unit: "h", values: [1, 2, 3, 6, 8, 12] },
  { label: "Days", unit: "d", values: [1, 2, 3, 4, 5, 6] },
  { label: "Weeks", unit: "w", values: [1, 2, 3, 4] },
  { label: "Months", unit: "M", values: [1, 2, 3] }
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

export type DateRangeFilterAccent = "primary" | "secondary";

type Props = {
  defaultValue?: DateRangeFilterValue;
  defaultIsUtc?: boolean;
  onChange: (value: DateRangeFilterResult) => void;
  accent?: DateRangeFilterAccent;
  isActive?: boolean;
  className?: string;
};

export const ACCENT_STYLES: Record<
  DateRangeFilterAccent,
  {
    selectedBorderBg: string;
    selectedCard: string;
    selectedBadge: string;
    selectedChip: string;
    switchChecked: string;
    applyButton: string;
    calendarMiddle: string;
    activeVariant: ButtonProps["variant"];
  }
> = {
  primary: {
    selectedBorderBg: "border-primary bg-primary/5",
    selectedCard: "border-primary/40 bg-primary/5 shadow-xs",
    selectedBadge: "rounded-sm bg-primary/5 px-1.5 py-0.5 text-[11px] font-medium text-primary",
    selectedChip: "border-primary/40 bg-primary/5 text-foreground",
    switchChecked:
      "data-[state=checked]:border-primary/25 data-[state=checked]:bg-primary/10 data-[state=checked]:hover:border-primary/30 data-[state=checked]:hover:bg-primary/15",
    applyButton: "border-primary/25 bg-primary/10 hover:bg-primary/15 hover:border-primary/30",
    calendarMiddle: "data-[range-middle=true]:!bg-muted/[12%]",
    activeVariant: "project"
  },
  secondary: {
    selectedBorderBg: "border-org bg-org/5",
    selectedCard: "border-org/40 bg-org/5 shadow-xs",
    selectedBadge: "rounded-sm bg-org/5 px-1.5 py-0.5 text-[11px] font-medium text-org",
    selectedChip: "border-org/40 bg-org/5 text-foreground",
    switchChecked:
      "data-[state=checked]:border-org/25 data-[state=checked]:bg-org/10 data-[state=checked]:hover:border-org/30 data-[state=checked]:hover:bg-org/15",
    applyButton: "border-org/25 bg-org/10 hover:bg-org/15 hover:border-org/30",
    calendarMiddle: "data-[range-middle=true]:!bg-muted/[12%]",
    activeVariant: "org"
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
  if (!val) return false;
  if (/^(\d+)M$/.test(val)) return parseInt(val, 10) > 0;
  const parsed = ms(val);
  return typeof parsed === "number" && parsed > 0;
}

function parseLastValue(val: string): { duration: string; unit: string } | null {
  const match = val.match(/^(\d+)([mhdwM])$/);
  if (!match) return null;
  return { duration: match[1], unit: match[2] };
}

function resolveDateRange(value: DateRangeFilterValue, isUtc: boolean): DateRangeFilterResult {
  if (value.type === DateRangeFilterType.Last) {
    const now = new Date();
    const monthMatch = value.value.match(/^(\d+)M$/);
    const startDate = monthMatch
      ? subMonths(now, parseInt(monthMatch[1], 10))
      : new Date(now.getTime() - ms(value.value));
    return { startDate, endDate: now, isUtc };
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
  isActive = true,
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

  // Last mode state — seed from the initial value if it's a Last type
  const initialLastParsed =
    initialValue.type === DateRangeFilterType.Last
      ? (parseLastValue(initialValue.value) ?? { duration: "1", unit: "h" })
      : { duration: "1", unit: "h" };
  const [customDuration, setCustomDuration] = useState<string>(initialLastParsed.duration);
  const [customUnit, setCustomUnit] = useState<string>(initialLastParsed.unit);

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
        const parsed = parseLastValue(appliedValue.value) ?? { duration: "1", unit: "h" };
        setCustomDuration(parsed.duration);
        setCustomUnit(parsed.unit);
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
      const lastVal = `${customDuration}${customUnit}`;
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

  const isInvalidFixedRange = useMemo(() => {
    if (mode !== DateRangeFilterType.Fixed || !pendingRange?.from || !pendingRange?.to)
      return false;
    const start = combineDateAndTime(pendingRange.from, startTime);
    const end = combineDateAndTime(pendingRange.to, endTime);
    return start >= end;
  }, [mode, pendingRange, startTime, endTime]);

  const isApplyDisabled = useMemo(() => {
    if (mode === DateRangeFilterType.Fixed) {
      if (!pendingRange?.from || !pendingRange?.to) return true;
      return isInvalidFixedRange;
    }
    return !isValidLastValue(`${customDuration}${customUnit}`);
  }, [mode, pendingRange, isInvalidFixedRange, customDuration, customUnit]);

  const accentStyles = ACCENT_STYLES[accent];
  const selectedCustomUnit = useMemo(
    () => RELATIVE_OPTIONS.find((opt) => opt.unit === customUnit),
    [customUnit]
  );

  const renderTrigger = () => {
    if (!isActive) {
      return (
        <Button variant="outline" size="sm" className={cn("gap-1.5 font-normal", className)}>
          <CalendarIcon className="text-muted-foreground size-3.5 shrink-0" />
          Custom
        </Button>
      );
    }

    if (appliedValue.type === DateRangeFilterType.Fixed) {
      return (
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1.5 font-normal", accentStyles.selectedChip, className)}
        >
          <span className="text-xs">{format(appliedValue.startDate, "MMM d, yyyy")}</span>
          <ArrowRight className="text-muted-foreground size-3 shrink-0" />
          <span className="text-xs">{format(appliedValue.endDate, "MMM d, yyyy")}</span>
          <CalendarIcon className="text-muted-foreground size-3.5 shrink-0" />
        </Button>
      );
    }

    return (
      <Button
        variant="outline"
        size="sm"
        className={cn("gap-1.5 font-normal", accentStyles.selectedChip, className)}
      >
        <CalendarIcon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="max-w-72 truncate">
          {formatTriggerLabel(appliedValue, appliedIsUtc)}
        </span>
      </Button>
    );
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{renderTrigger()}</PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-auto min-w-[30rem] overflow-hidden p-0">
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
                  <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Quick ranges
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {SECONDARY_PRESETS.map(({ value: val, label }) => {
                      const parsed = parseLastValue(val);
                      const isPresetActive =
                        parsed &&
                        customDuration === parsed.duration &&
                        customUnit === parsed.unit;
                      return (
                        <Button
                          key={val}
                          size="xs"
                          variant={isPresetActive ? accentStyles.activeVariant : "outline"}
                          isFullWidth
                          className="justify-start"
                          onClick={() => {
                            if (parsed) {
                              setCustomDuration(parsed.duration);
                              setCustomUnit(parsed.unit);
                            }
                          }}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>

                  <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Custom
                  </span>
                  <div className="flex items-center gap-2">
                    <UnstableInput
                      type="text"
                      inputMode="numeric"
                      placeholder="Amount"
                      className="h-8 flex-1 text-xs"
                      value={customDuration}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || /^[1-9]\d*$/.test(val)) {
                          setCustomDuration(val);
                        }
                      }}
                    />
                    <Select value={customUnit} onValueChange={setCustomUnit}>
                      <SelectTrigger size="sm" className="!h-8 flex-1 text-xs">
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

                  <div className="flex flex-wrap gap-2">
                    {selectedCustomUnit?.values.map((val) => {
                      const isChipActive = customDuration === String(val);
                      return (
                        <Button
                          key={`${selectedCustomUnit.unit}-${val}`}
                          size="xs"
                          variant={isChipActive ? accentStyles.activeVariant : "outline"}
                          onClick={() => setCustomDuration(String(val))}
                        >
                          {val}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {mode === DateRangeFilterType.Fixed && (
                <div className="flex flex-col gap-3">
                  {/* Calendar */}
                  <Calendar
                    mode="range"
                    selected={pendingRange}
                    onSelect={(range, selectedDay) => {
                      // If a complete range (with distinct start/end) is already selected, restart from the clicked date
                      if (
                        pendingRange?.from &&
                        pendingRange?.to &&
                        pendingRange.from.getTime() !== pendingRange.to.getTime()
                      ) {
                        setPendingRange({ from: selectedDay, to: undefined });
                        return;
                      }
                      setPendingRange(range);
                    }}
                    numberOfMonths={2}
                    showOutsideDays={false}
                    captionLayout="dropdown"
                    disabled={[{ after: today }, { before: addDays(subMonths(today, MAX_RANGE_MONTHS), 1) }]}
                    defaultMonth={calendarDefaultMonth}
                    startMonth={addDays(subMonths(today, MAX_RANGE_MONTHS), 1)}
                    endMonth={today}
                    className="p-0"
                    classNames={{
                      range_start:
                        "rounded-l-(--cell-radius) bg-muted/[12%] relative after:bg-muted/[12%] after:absolute after:inset-y-0 after:w-4 after:right-0 z-0 isolate",
                      range_end:
                        "rounded-r-(--cell-radius) bg-muted/[12%] relative after:bg-muted/[12%] after:absolute after:inset-y-0 after:w-4 after:left-0 z-0 isolate",
                      range_middle: "rounded-none"
                    }}
                    components={{
                      DayButton: (props) => (
                        <CalendarDayButton {...props} className={accentStyles.calendarMiddle} />
                      )
                    }}
                  />

                  {/* Time inputs */}
                  <div className="flex flex-col gap-2 border-t border-border pt-2">
                    <div className="flex items-end gap-2">
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="text-muted-foreground text-xs">Start Time</span>
                        <UnstableInput
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="h-9 w-full text-sm scheme-dark [&::-webkit-calendar-picker-indicator]:hidden"
                        />
                      </div>
                      <span className="text-muted-foreground mb-2">→</span>
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="text-muted-foreground text-xs">End Time</span>
                        <UnstableInput
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="h-9 w-full text-sm scheme-dark [&::-webkit-calendar-picker-indicator]:hidden"
                        />
                      </div>
                    </div>
                    {isInvalidFixedRange && (
                      <p className="text-xs text-red-400">Start date must be before end date.</p>
                    )}
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
                className={!isApplyDisabled ? accentStyles.applyButton : undefined}
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
