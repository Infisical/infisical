import { ChangeEventHandler, useState } from "react";
import { DayPicker, DayPickerProps, getDefaultClassNames, TZDate, UI } from "react-day-picker";
import { faCalendar } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PopoverContentProps, PopoverProps } from "@radix-ui/react-popover";
import { format, setHours, setMinutes } from "date-fns";
import { twMerge } from "tailwind-merge";

import { cn } from "@app/components/v3/utils";
import { formatDateTime, Timezone } from "@app/helpers/datetime";

import { Button } from "../Button";
import { Input } from "../Input";
import { Popover, PopoverContent, PopoverTrigger } from "../Popoverv2";

const defaultClassNames = getDefaultClassNames();

export type DatePickerProps = Omit<DayPickerProps, "selected"> & {
  value?: Date;
  onChange: (date?: Date) => void;
  popUpProps: PopoverProps;
  popUpContentProps: PopoverContentProps;
  dateFormat?: "PPP" | "PP" | "P"; // extend as needed
  hideTime?: boolean;
  buttonClassName?: string;
  timezone?: Timezone;
};

const localTimeToUTC = (timeString: string) => {
  const today = new Date();
  const [hours, minutes] = timeString.split(":").map(Number);

  today.setHours(hours, minutes, 0, 0);

  const utcHours = today.getUTCHours().toString().padStart(2, "0");
  const utcMinutes = today.getUTCMinutes().toString().padStart(2, "0");

  return `${utcHours}:${utcMinutes}`;
};

const utcTimeToLocal = (utcTimeString: string) => {
  const today = new Date();
  const [hours, minutes] = utcTimeString.split(":").map(Number);

  today.setUTCHours(hours, minutes, 0, 0);

  const localHours = today.getHours().toString().padStart(2, "0");
  const localMinutes = today.getMinutes().toString().padStart(2, "0");

  return `${localHours}:${localMinutes}`;
};

// Doc: https://react-day-picker.js.org/
export const DatePicker = ({
  value,
  onChange,
  popUpProps,
  popUpContentProps,
  dateFormat = "PPP",
  hideTime = false,
  buttonClassName,
  timezone,
  ...props
}: DatePickerProps) => {
  const [timeValue, setTimeValue] = useState<string>(value ? format(value, "HH:mm") : "00:00");
  const displayUtc = timezone === Timezone.UTC;

  const handleTimeChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const time = displayUtc ? utcTimeToLocal(e.target.value) : e.target.value;

    if (time) {
      setTimeValue(time);
      if (value) {
        const [hours, minutes] = time.split(":").map((str) => parseInt(str, 10));
        const newSelectedDate = setHours(setMinutes(value, minutes), hours);
        onChange(newSelectedDate);
      }
    }
  };

  const handleDaySelect = (date: Date | undefined) => {
    if (!timeValue || !date) {
      onChange(date);
      return;
    }

    const [hours, minutes] = timeValue.split(":").map((str) => parseInt(str, 10));
    const newDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
    onChange(newDate);
  };

  return (
    <Popover {...popUpProps}>
      <PopoverTrigger asChild>
        <Button
          className={buttonClassName}
          variant="outline_bg"
          leftIcon={<FontAwesomeIcon icon={faCalendar} />}
        >
          {value
            ? formatDateTime({ timestamp: value, timezone, dateFormat })
            : `Select Date${hideTime ? "" : " and Time"}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        {...popUpContentProps}
        className={twMerge(
          "w-fit border border-mineshaft-600 bg-mineshaft-800 p-2 font-inter",
          popUpContentProps.className
        )}
      >
        <div className="px-2 pt-4">
          <DayPicker
            {...props}
            mode="single"
            selected={value ? new TZDate(value, displayUtc ? "UTC" : undefined) : undefined}
            onSelect={(date) => handleDaySelect(date ? new TZDate(date, undefined) : undefined)}
            className="font-inter text-mineshaft-200"
            timeZone={displayUtc ? "UTC" : undefined}
            classNames={{
              today: "text-primary border-primary",
              selected: " text-mineshaft-100 bg-mineshaft-500",
              root: `text-mineshaft-300  ${defaultClassNames}`,
              [UI.DayButton]:
                "p-3 w-full cursor-pointer text-center  rounded-sm hover:text-mineshaft-100",
              [UI.Weekday]: "px-3 pt-3",
              [UI.Chevron]: "fill-mineshaft-300/70 hover:fill-mineshaft-300",
              disabled: "text-mineshaft-400 pointer-events-none",
              nav: cn(
                "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
                defaultClassNames.nav
              ),
              months: cn("flex gap-4 flex-col md:flex-row relative", defaultClassNames.months),
              month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
              button_previous: cn(
                "aria-disabled:opacity-50 p-0 cursor-pointer select-none",
                defaultClassNames.button_previous
              ),
              button_next: cn(
                "aria-disabled:opacity-50 p-0 cursor-pointer select-none",
                defaultClassNames.button_next
              ),
              month_caption: cn(
                "flex items-center justify-center w-full ",
                defaultClassNames.month_caption
              )
            }}
          />
        </div>
        {!hideTime && (
          <div className="mx-4 my-4">
            <Input
              type="time"
              value={displayUtc ? localTimeToUTC(timeValue) : timeValue}
              onChange={handleTimeChange}
              className="bg-mineshaft-700 text-white scheme-dark"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
