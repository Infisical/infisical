# Calendar

Choose a date with keyboard-accessible month navigation.

## Choose this component

Choose Calendar for day-based selection with spatial date context. Use a text field for free-form input and a separate time control for an instant.

## Usage rules

### calendar-usage

Owner: calendar.

When the task asks for an expiry date rather than an exact UTC timestamp.

Do: Construct local calendar Dates and show a readable selected date; require both ends before submitting a range.

Avoid: Parse YYYY-MM-DD as an implicit UTC instant or treat a start-only range as complete.

Why: Timezone conversion can shift a calendar day, and a partial range has no end date.

Checked by: review only. Look for: Choose a local date and a start-only range across timezone settings; the calendar day remains the intended day and incomplete ranges cannot be submitted as complete.

Source evidence:
- src/components/v4/ui/calendar.tsx
- src/pages/design-system/examples/calendar/default.tsx

## State guidance

- empty: Describe what date to choose without inventing a default expiry.
- range: Announce the start-only state and request an end date before submission.

## Presentation rules

Do: Display constraints such as weekdays and the selected result beside the calendar.

Avoid: Decorate arbitrary dates with status dots that have no legend or task meaning.

Why: Unexplained marks create false availability or activity information.

## Import and exports

- src/components/v4/ui/calendar.tsx

Exports: Calendar, CalendarDayButton. Source TypeScript defines the API.

## Behavior

- Calendar forwards the installed DayPicker selection modes. In optional single mode selected is Date or undefined and onSelect may clear it; optional multiple mode uses Date[] or undefined, and range mode uses DateRange or undefined, including an unfinished range.

## Accessibility

- Each day is announced by its full date, and arrow keys move between days. Label what the date is for and show a readable summary of the selected date.

## Use cases

- Handle undefined and partial range values explicitly and serialize date-only choices using the host's intended calendar and timezone.

## Avoid

- Slice a UTC timestamp to derive the displayed local day or treat the first range click as a complete booking.

## Limits

- Date values do not define a storage format. The host owns timezone and date-only serialization; do not derive a local calendar date by slicing a UTC ISO timestamp. Accept optional empty and incomplete range states.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### selection mode

- single: example `default`, visible label "Single expiry date".
- range: example `default`, visible label "Date range with month and year controls".
- multiple: omitted. mode="multiple" looks like single with several days marked and selected is a Date[]; the behavior notes cover it.
- none: omitted. Without a mode the grid is the same and days are not selectable, so there is nothing to see.

### caption layout

- label: example `default`, visible label "Single expiry date".
- dropdown: example `default`, visible label "Date range with month and year controls".
- dropdown-months: omitted. Same as dropdown with only the month select; the year stays a plain label.
- dropdown-years: omitted. Same as dropdown with only the year select; the month stays a plain label.

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Single date and date range

Save this example at `src/pages/design-system/examples/calendar/default.tsx`; its relative imports are generated for that exact path. States: default, disabled, controlled.

Registry items used: @infisical/calendar. Additional packages: react-day-picker@^9.13.0. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { type DateRange } from "react-day-picker";
import { Calendar } from "../../../../components/v4/ui/calendar";
const month = new Date(2026, 8, 1);
const readable = (date: Date) => date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const rangeSummary = (range: DateRange | undefined) => {
    if (!range?.from)
        return "Choose a start date";
    if (!range.to)
        return `Start ${readable(range.from)}. Choose an end date.`;
    return `${readable(range.from)} to ${readable(range.to)}`;
};
export default function Example() {
    const [date, setDate] = useState<Date | undefined>(new Date(2026, 8, 14));
    const [range, setRange] = useState<DateRange | undefined>({
        from: new Date(2026, 8, 14),
        to: undefined
    });
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      <figure aria-label="Single expiry date" className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Calendar aria-label="Expiry date" mode="single" defaultMonth={month} selected={date} onSelect={setDate} disabled={{ before: new Date(2026, 8, 3) }} footer={date ? readable(date) : "Choose an expiry date"}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Single expiry date"}</figcaption></figure>
      <figure aria-label="Date range with month and year controls" className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Calendar aria-label="Access window" mode="range" min={2} max={7} excludeDisabled disabled={{ dayOfWeek: [0, 6] }} defaultMonth={month} selected={range} onSelect={setRange} captionLayout="dropdown" startMonth={new Date(2025, 0, 1)} endMonth={new Date(2027, 11, 31)} footer={rangeSummary(range)}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Date range with month and year controls"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#calendar and verify the documented interaction.
