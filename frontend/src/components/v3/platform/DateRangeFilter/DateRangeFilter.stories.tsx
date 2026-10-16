import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { subDays, subMonths } from "date-fns";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";

import { ButtonGroup } from "../../generic/ButtonGroup";
import {
  DateRangeFilter,
  type DateRangeFilterAccent,
  type DateRangeFilterResult,
  DateRangeFilterType
} from "./DateRangeFilter";
import { DateRangeQuickPresets } from "./DateRangeQuickPresets";

const atTime = (date: Date, hours: number, minutes = 0) => {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
};

const meta = {
  title: "Platform/Date Range Filter",
  component: DateRangeFilter,
  parameters: {
    layout: "centered"
  },
  args: {
    onChange: fn(),
    onClear: undefined
  },
  tags: ["autodocs"]
} satisfies Meta<typeof DateRangeFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "With no default value the filter starts on Last 1 hour. Last counts back from now; Fixed picks a start and end on the calendar, down to the minute."
      }
    }
  }
};

export const Accents: Story = {
  name: "Example: Accents",
  render: (args) => (
    <div className="flex items-center gap-3">
      {(["primary", "secondary", "av"] as DateRangeFilterAccent[]).map((accent) => (
        <DateRangeFilter key={accent} {...args} accent={accent} />
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Match the accent to the scope: primary inside a project, secondary at the organization, av in Agent Vault. It colours the selected tab, presets, calendar range and Apply button."
      }
    }
  }
};

export const FixedRange: Story = {
  name: "Example: Fixed Range",
  args: {
    defaultValue: {
      type: DateRangeFilterType.Fixed,
      startDate: atTime(subDays(new Date(), 7), 9),
      endDate: atTime(subDays(new Date(), 5), 17, 30)
    }
  },
  parameters: {
    docs: {
      description: {
        story:
          "A fixed range shows its start and end dates on the trigger. Opening it restores the calendar selection and both times."
      }
    }
  }
};

export const Inactive: Story = {
  name: "Example: Inactive",
  render: (args) => (
    <div className="flex items-center gap-3">
      <DateRangeFilter {...args} isActive={false} />
      <DateRangeFilter {...args} isActive={false} inactiveLabel="Entire Session" accent="av" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Set isActive to false when no range applies, for example while a quick preset is chosen instead. The trigger then shows inactiveLabel, which defaults to Custom."
      }
    }
  }
};

const ClearableFilter = (args: Story["args"]) => {
  const [range, setRange] = useState<DateRangeFilterResult | null>(null);

  return (
    <div className="flex flex-col items-center gap-3">
      <DateRangeFilter
        {...args}
        onChange={(result) => {
          setRange(result);
          args?.onChange?.(result);
        }}
        onClear={() => {
          setRange(null);
          args?.onClear?.();
        }}
        isActive={Boolean(range)}
        inactiveLabel="Any Time"
      />
      <span className="text-xs text-muted">
        {range
          ? `${range.startDate.toLocaleString()} to ${range.endDate.toLocaleString()}`
          : "No range applied"}
      </span>
    </div>
  );
};

export const Clearable: Story = {
  name: "Example: Clearable",
  args: {
    onClear: fn()
  },
  render: (args) => <ClearableFilter {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: /Any Time/ }));
    await expect(body.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Apply" }));
    await expect(args.onChange).toHaveBeenCalledTimes(1);

    await userEvent.click(canvas.getByRole("button", { name: /Last 1h/ }));
    await userEvent.click(body.getByRole("button", { name: "Clear" }));
    await expect(args.onClear).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole("button", { name: /Any Time/ })).toBeInTheDocument();
  },
  parameters: {
    docs: {
      description: {
        story:
          "Pass onClear to offer a Clear button in the footer. It appears only while a range is applied, and the parent decides what cleared means by flipping isActive."
      }
    }
  }
};

export const WithoutTimezoneToggle: Story = {
  name: "Example: Without Timezone Toggle",
  args: {
    showTimezoneToggle: false,
    defaultValue: {
      type: DateRangeFilterType.Fixed,
      startDate: atTime(subDays(new Date(), 3), 0),
      endDate: atTime(subDays(new Date(), 1), 23, 59)
    }
  },
  parameters: {
    docs: {
      description: {
        story:
          "Hide the Local/UTC toggle when the results are always shown in one timezone. It only ever appears on the Fixed tab."
      }
    }
  }
};

export const Utc: Story = {
  name: "Example: UTC by Default",
  args: {
    defaultIsUtc: true,
    defaultValue: {
      type: DateRangeFilterType.Fixed,
      startDate: atTime(subDays(new Date(), 2), 8),
      endDate: atTime(subDays(new Date(), 2), 18)
    }
  },
  parameters: {
    docs: {
      description: {
        story:
          "defaultIsUtc starts the toggle on UTC. The result passed to onChange carries isUtc so the caller can format timestamps to match."
      }
    }
  }
};

export const EarliestDate: Story = {
  name: "Example: Earliest Date",
  args: {
    earliestDate: subMonths(new Date(), 8)
  },
  parameters: {
    docs: {
      description: {
        story:
          "The calendar reaches back three months by default. Pass earliestDate to move that bound, further back for data kept longer, or forward so days before the data existed can't be picked."
      }
    }
  }
};

export const FixedOnly: Story = {
  name: "Example: Fixed Only",
  args: {
    showRelativeRanges: false,
    earliestDate: subDays(new Date(), 20)
  },
  parameters: {
    docs: {
      description: {
        story:
          "Set showRelativeRanges to false when counting back from now means nothing, such as for data that ended long ago. Only the Fixed tab is shown, and with no default value it starts on the whole span from earliestDate to now."
      }
    }
  }
};

const WithQuickPresetsFilter = (args: Story["args"]) => {
  const [preset, setPreset] = useState("1h");

  return (
    <ButtonGroup>
      <DateRangeQuickPresets
        value={preset}
        onChange={(value, result) => {
          setPreset(value);
          args?.onChange?.(result);
        }}
      />
      <DateRangeFilter
        {...args}
        isActive={!preset}
        onChange={(result) => {
          setPreset("");
          args?.onChange?.(result);
        }}
      />
    </ButtonGroup>
  );
};

export const WithQuickPresets: Story = {
  name: "Example: With Quick Presets",
  render: (args) => <WithQuickPresetsFilter {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          "The Audit Logs layout: quick presets for common windows, with the filter as the Custom option beside them. Choosing a preset makes the filter inactive, and applying a custom range clears the preset."
      }
    }
  }
};

const SessionLogsFilter = ({
  isSessionActive,
  ...args
}: Story["args"] & { isSessionActive: boolean }) => {
  const [range, setRange] = useState<DateRangeFilterResult | null>(null);

  return (
    <DateRangeFilter
      {...args}
      accent="av"
      inactiveLabel="Entire Session"
      showTimezoneToggle={false}
      earliestDate={subDays(new Date(), isSessionActive ? 2 : 120)}
      showRelativeRanges={isSessionActive}
      isActive={Boolean(range)}
      onChange={(result) => {
        setRange(result);
        args?.onChange?.(result);
      }}
      onClear={() => setRange(null)}
    />
  );
};

export const SessionLogs: Story = {
  name: "Example: Session Logs",
  render: (args) => (
    <div className="flex items-center gap-3">
      <SessionLogsFilter {...args} isSessionActive />
      <SessionLogsFilter {...args} isSessionActive={false} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Agent Vault's session logs: the calendar starts on the day the session was created, Clear goes back to the entire session, and an ended session offers only fixed ranges. The second filter is for a session that ended four months ago, past the default three-month bound."
      }
    }
  }
};

export const InvalidFixedRange: Story = {
  name: "Example: Invalid Fixed Range",
  args: {
    defaultValue: {
      type: DateRangeFilterType.Fixed,
      startDate: atTime(subDays(new Date(), 1), 9),
      endDate: atTime(subDays(new Date(), 1), 17)
    }
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button"));
    const [startTime] =
      canvasElement.ownerDocument.body.querySelectorAll<HTMLInputElement>('input[type="time"]');
    fireEvent.change(startTime, { target: { value: "18:00" } });

    await expect(body.getByText("Start date must be before end date.")).toBeInTheDocument();
    await expect(body.getByRole("button", { name: "Apply" })).toBeDisabled();
    await expect(args.onChange).not.toHaveBeenCalled();
  },
  parameters: {
    docs: {
      description: {
        story:
          "A start at or after the end shows an error under the times and disables Apply, so onChange never receives a backwards range."
      }
    }
  }
};
