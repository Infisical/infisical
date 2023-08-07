import { DayPicker, DayPickerProps } from "react-day-picker";
import { faCalendar } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PopoverContentProps, PopoverProps } from "@radix-ui/react-popover";
import { format } from "date-fns";

import { Button } from "../Button";
import { Popover, PopoverContent, PopoverTrigger } from "../Popoverv2";

export type DatePickerProps = Omit<DayPickerProps, "selected"> & {
  value?: Date;
  onChange: (date?: Date) => void;
  popUpProps: PopoverProps;
  popUpContentProps: PopoverContentProps;
};

// Doc: https://react-day-picker.js.org/
export const DatePicker = ({
  value,
  onChange,
  popUpProps,
  popUpContentProps,
  ...props
}: DatePickerProps) => {
  return (
    <Popover {...popUpProps}>
      <PopoverTrigger asChild>
        <Button variant="outline_bg" leftIcon={<FontAwesomeIcon icon={faCalendar} />}>
          {value ? format(value, "PPP") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-fit p-2" {...popUpContentProps}>
        <DayPicker {...props} mode="single" selected={value} onSelect={onChange} />
      </PopoverContent>
    </Popover>
  );
};
