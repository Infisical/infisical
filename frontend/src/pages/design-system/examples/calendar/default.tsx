import { useState } from "react";
import { type DateRange } from "react-day-picker";

import { Calendar } from "@app/components/v4/ui/calendar";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const month = new Date(2026, 8, 1);
const readable = (date: Date) =>
  date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const rangeSummary = (range: DateRange | undefined) => {
  if (!range?.from) return "Choose a start date";
  if (!range.to) return `Start ${readable(range.from)}. Choose an end date.`;
  return `${readable(range.from)} to ${readable(range.to)}`;
};
export default function Example() {
  const [date, setDate] = useState<Date | undefined>(new Date(2026, 8, 14));
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(2026, 8, 14),
    to: undefined
  });
  return (
    <ExampleGrid width="wide">
      <ExampleCell aria-label="Single expiry date" label="Single expiry date">
        <Calendar
          aria-label="Expiry date"
          mode="single"
          defaultMonth={month}
          selected={date}
          onSelect={setDate}
          disabled={{ before: new Date(2026, 8, 3) }}
          footer={date ? readable(date) : "Choose an expiry date"}
        />
      </ExampleCell>
      <ExampleCell
        aria-label="Date range with month and year controls"
        label="Date range with month and year controls"
      >
        <Calendar
          aria-label="Access window"
          mode="range"
          min={2}
          max={7}
          excludeDisabled
          disabled={{ dayOfWeek: [0, 6] }}
          defaultMonth={month}
          selected={range}
          onSelect={setRange}
          captionLayout="dropdown"
          startMonth={new Date(2025, 0, 1)}
          endMonth={new Date(2027, 11, 31)}
          footer={rangeSummary(range)}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
