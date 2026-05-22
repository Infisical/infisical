import { useState } from "react";
import type { DateRange } from "react-day-picker";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarIcon } from "lucide-react";

import { Button } from "../Button";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover";
import { Calendar } from "./Calendar";

/**
 * Calendars let the user pick a date, a set of dates, or a date range.
 * This component is a thin wrapper around `react-day-picker` — the `mode` prop
 * switches between `single`, `multiple`, and `range` selection, and `captionLayout`
 * swaps the month header between a static label and dropdowns for month / year
 * navigation.
 */
const meta = {
  title: "Generic/Calendar",
  component: Calendar,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    mode: {
      control: "select",
      options: ["single", "multiple", "range"]
    },
    captionLayout: {
      control: "select",
      options: ["label", "dropdown", "dropdown-months", "dropdown-years"]
    },
    numberOfMonths: {
      control: { type: "number", min: 1, max: 3 }
    },
    showOutsideDays: {
      control: "boolean"
    },
    buttonVariant: {
      control: "select",
      options: ["ghost", "outline", "ghost-muted"]
    }
  }
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

const SingleStory = () => {
  const [selected, setSelected] = useState<Date | undefined>(new Date());
  return <Calendar mode="single" selected={selected} onSelect={setSelected} />;
};

export const Single: Story = {
  name: "Variant: Single",
  parameters: {
    docs: {
      description: {
        story:
          'Use `mode="single"` for a single-date picker. The selected day is highlighted with a filled foreground chip; today\'s date is outlined separately.'
      }
    }
  },
  render: () => <SingleStory />
};

const MultipleStory = () => {
  const today = new Date();
  const [selected, setSelected] = useState<Date[] | undefined>([
    today,
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2),
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5)
  ]);
  return <Calendar mode="multiple" selected={selected} onSelect={setSelected} />;
};

export const Multiple: Story = {
  name: "Variant: Multiple",
  parameters: {
    docs: {
      description: {
        story:
          'Use `mode="multiple"` when the user should pick an arbitrary set of discrete dates. Each selection toggles independently.'
      }
    }
  },
  render: () => <MultipleStory />
};

const RangeStory = () => {
  const today = new Date();
  const [selected, setSelected] = useState<DateRange | undefined>({
    from: today,
    to: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6)
  });
  return <Calendar mode="range" selected={selected} onSelect={setSelected} />;
};

export const Range: Story = {
  name: "Variant: Range",
  parameters: {
    docs: {
      description: {
        story:
          'Use `mode="range"` to pick a start / end pair. The first click sets the start; the second sets the end. Days between the bounds render with a muted background — the pattern used by `DateRangeFilter`.'
      }
    }
  },
  render: () => <RangeStory />
};

const DropdownCaptionStory = () => {
  const [selected, setSelected] = useState<Date | undefined>(new Date());
  return (
    <Calendar mode="single" captionLayout="dropdown" selected={selected} onSelect={setSelected} />
  );
};

export const DropdownCaption: Story = {
  name: "Example: Dropdown Caption",
  parameters: {
    docs: {
      description: {
        story:
          'Pass `captionLayout="dropdown"` to replace the month label with month + year dropdowns. Use when the user may need to jump across many years (e.g. birthdays, historic audit ranges).'
      }
    }
  },
  render: () => <DropdownCaptionStory />
};

const TwoMonthsStory = () => {
  const today = new Date();
  const [selected, setSelected] = useState<DateRange | undefined>({
    from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2),
    to: new Date(today.getFullYear(), today.getMonth() + 1, today.getDate() + 3)
  });
  return <Calendar mode="range" numberOfMonths={2} selected={selected} onSelect={setSelected} />;
};

export const TwoMonths: Story = {
  name: "Example: Two Months",
  parameters: {
    docs: {
      description: {
        story:
          'Set `numberOfMonths={2}` (or more) to show adjacent months side-by-side. Most useful with `mode="range"` so the user can drag a span across month boundaries without paging.'
      }
    }
  },
  render: () => <TwoMonthsStory />
};

const DisabledDatesStory = () => {
  const [selected, setSelected] = useState<Date | undefined>();
  return (
    <Calendar
      mode="single"
      selected={selected}
      onSelect={setSelected}
      disabled={{ before: new Date() }}
    />
  );
};

export const DisabledDates: Story = {
  name: "Example: Disabled Dates",
  parameters: {
    docs: {
      description: {
        story:
          "Pass a matcher to `disabled` to grey out and block interaction for specific days. The `{ before: new Date() }` matcher here disables every past day — use for forward-only pickers like scheduled rotations or expirations."
      }
    }
  },
  render: () => <DisabledDatesStory />
};

const InPopoverStory = () => {
  const [selected, setSelected] = useState<Date | undefined>();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-56 justify-start">
          <CalendarIcon />
          {selected
            ? selected.toLocaleDateString(undefined, { dateStyle: "medium" })
            : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={selected} onSelect={setSelected} />
      </PopoverContent>
    </Popover>
  );
};

export const InPopover: Story = {
  name: "Example: In Popover",
  parameters: {
    docs: {
      description: {
        story:
          'The canonical date-picker pattern: a `Button` shows the selected date, clicking it opens the `Calendar` in a `Popover`. Set `className="w-auto p-0"` on `PopoverContent` so the calendar\'s own padding controls the layout (the popover\'s default padding would double-pad the grid). Use `align="start"` so the popover anchors to the trigger\'s leading edge.'
      }
    }
  },
  render: () => <InPopoverStory />
};
