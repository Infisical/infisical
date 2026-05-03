import type { Meta, StoryObj } from "@storybook/react-vite";
import { HelpCircleIcon, InfoIcon } from "lucide-react";

import { Button } from "../Button";
import { IconButton } from "../IconButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";

/**
 * Tooltips surface short, contextual hints anchored to a trigger element.
 * Use them to name icon-only controls, explain *why* something is disabled,
 * or expose secondary detail that isn't worth the visual weight of a label.
 *
 * The compound API is `<Tooltip><TooltipTrigger /><TooltipContent /></Tooltip>`.
 * `Tooltip` already wraps its children in a `TooltipProvider` internally, so
 * ad-hoc tooltips don't need a provider higher in the tree. Wrap your trigger
 * with `asChild` to forward the trigger props onto a `Button`, `IconButton`,
 * or any focusable element — keep tooltip content to a single short sentence,
 * and never put interactive controls inside it.
 */
const meta = {
  title: "Generic/Tooltip",
  component: Tooltip,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    delayDuration: {
      control: "number"
    },
    defaultOpen: {
      control: "boolean"
    },
    disableHoverableContent: {
      control: "boolean"
    },
    open: {
      table: {
        disable: true
      }
    },
    onOpenChange: {
      table: {
        disable: true
      }
    },
    children: {
      table: {
        disable: true
      }
    }
  },
  args: { delayDuration: 0, defaultOpen: false }
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The canonical usage — `Tooltip` wraps a trigger and a content body. Use `asChild` on `TooltipTrigger` to forward props onto an existing focusable element rather than rendering an extra wrapper. `Tooltip` includes its own `TooltipProvider`, so you don't need to wrap the page."
      }
    }
  },
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>This is a tooltip</TooltipContent>
    </Tooltip>
  )
};

export const IconTrigger: Story = {
  name: "Example: Icon Trigger",
  parameters: {
    docs: {
      description: {
        story:
          "Icon-only controls have no visible label, so a tooltip is what tells the user what the action does. Pair an `IconButton` with a tooltip whenever the icon's meaning isn't already obvious from context."
      }
    }
  },
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton variant="ghost" aria-label="Help">
          <HelpCircleIcon />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>View help and documentation</TooltipContent>
    </Tooltip>
  )
};

export const SideTop: Story = {
  name: "Variant: Side — Top",
  parameters: {
    docs: {
      description: {
        story:
          '`side="top"` is the default and the safest choice for inline triggers — the tooltip rises above the cursor without obscuring the trigger or following content.'
      }
    }
  },
  decorators: [
    (Story) => (
      <div className="p-12">
        <Story />
      </div>
    )
  ],
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Top</Button>
      </TooltipTrigger>
      <TooltipContent side="top">Anchored above the trigger</TooltipContent>
    </Tooltip>
  )
};

export const SideRight: Story = {
  name: "Variant: Side — Right",
  parameters: {
    docs: {
      description: {
        story:
          '`side="right"` works well for triggers at the end of a row or in a left-rail nav, where there\'s horizontal room and content above/below would be cramped.'
      }
    }
  },
  decorators: [
    (Story) => (
      <div className="p-12">
        <Story />
      </div>
    )
  ],
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Right</Button>
      </TooltipTrigger>
      <TooltipContent side="right">Anchored to the right of the trigger</TooltipContent>
    </Tooltip>
  )
};

export const SideBottom: Story = {
  name: "Variant: Side — Bottom",
  parameters: {
    docs: {
      description: {
        story:
          '`side="bottom"` suits triggers in a top toolbar or header where content above is already busy.'
      }
    }
  },
  decorators: [
    (Story) => (
      <div className="p-12">
        <Story />
      </div>
    )
  ],
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Bottom</Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Anchored below the trigger</TooltipContent>
    </Tooltip>
  )
};

export const SideLeft: Story = {
  name: "Variant: Side — Left",
  parameters: {
    docs: {
      description: {
        story:
          '`side="left"` is useful for triggers on the right edge of a panel or row — Radix will still flip automatically if there isn\'t space, so this is a hint rather than a guarantee.'
      }
    }
  },
  decorators: [
    (Story) => (
      <div className="p-12">
        <Story />
      </div>
    )
  ],
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Left</Button>
      </TooltipTrigger>
      <TooltipContent side="left">Anchored to the left of the trigger</TooltipContent>
    </Tooltip>
  )
};

export const AlignStart: Story = {
  name: "Variant: Align — Start",
  parameters: {
    docs: {
      description: {
        story:
          '`align="start"` lines up the start edge of the tooltip with the start edge of the trigger. Use it when the trigger sits on a left margin and you want the tooltip to read flush with it.'
      }
    }
  },
  decorators: [
    (Story) => (
      <div className="p-12">
        <Story />
      </div>
    )
  ],
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Align start</Button>
      </TooltipTrigger>
      <TooltipContent align="start">Aligned to the trigger&apos;s start edge</TooltipContent>
    </Tooltip>
  )
};

export const AlignCenter: Story = {
  name: "Variant: Align — Center",
  parameters: {
    docs: {
      description: {
        story: '`align="center"` is the default — the tooltip is centered on the trigger.'
      }
    }
  },
  decorators: [
    (Story) => (
      <div className="p-12">
        <Story />
      </div>
    )
  ],
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Align center</Button>
      </TooltipTrigger>
      <TooltipContent align="center">Centered on the trigger</TooltipContent>
    </Tooltip>
  )
};

export const AlignEnd: Story = {
  name: "Variant: Align — End",
  parameters: {
    docs: {
      description: {
        story:
          '`align="end"` lines up the end edge of the tooltip with the end edge of the trigger — useful for triggers that sit against a right edge.'
      }
    }
  },
  decorators: [
    (Story) => (
      <div className="p-12">
        <Story />
      </div>
    )
  ],
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Align end</Button>
      </TooltipTrigger>
      <TooltipContent align="end">Aligned to the trigger&apos;s end edge</TooltipContent>
    </Tooltip>
  )
};

export const LongContent: Story = {
  name: "Example: Long Content",
  parameters: {
    docs: {
      description: {
        story:
          "`TooltipContent` is `w-fit` by default, so long single-line content will keep growing horizontally. Set a `max-w-*` on `TooltipContent` to force wrapping for multi-sentence hints."
      }
    }
  },
  decorators: [
    (Story) => (
      <div className="p-12">
        <Story />
      </div>
    )
  ],
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton variant="ghost" aria-label="More info">
          <InfoIcon />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        When a regex pattern is set, it takes precedence over min/max length constraints. Consider
        defining length requirements directly in your regex pattern instead.
      </TooltipContent>
    </Tooltip>
  )
};

export const CustomDelay: Story = {
  name: "Example: Custom Delay",
  parameters: {
    docs: {
      description: {
        story:
          "`delayDuration` defaults to `0` so info-style triggers feel snappy. Bump it to ~300–500ms for hover-only discoverability tooltips, where opening immediately on every passing cursor is noisy."
      }
    }
  },
  render: () => (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover (500ms delay)</Button>
      </TooltipTrigger>
      <TooltipContent>Opens after a half-second hover</TooltipContent>
    </Tooltip>
  )
};

export const DefaultOpenState: Story = {
  name: "State: Default Open",
  parameters: {
    docs: {
      description: {
        story:
          "Use `defaultOpen` for an uncontrolled tooltip that starts open (handy in this docs frame). For full control, pass `open` + `onOpenChange` and drive it from your own state — useful when you need a tooltip to react to something other than hover/focus."
      }
    }
  },
  decorators: [
    (Story) => (
      <div className="p-12">
        <Story />
      </div>
    )
  ],
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant="outline">Already open</Button>
      </TooltipTrigger>
      <TooltipContent>This tooltip rendered open</TooltipContent>
    </Tooltip>
  )
};

export const OnDisabledTrigger: Story = {
  name: "Example: On Disabled Trigger",
  parameters: {
    docs: {
      description: {
        story:
          "Native disabled buttons don't fire pointer events, so a tooltip on a disabled `Button` will silently not open. Wrap the disabled trigger in a `<span tabIndex={0}>` so the tooltip still receives hover and keyboard focus — and use the tooltip to explain *why* the action is disabled."
      }
    }
  },
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <span tabIndex={0}>
          <Button variant="outline" isDisabled>
            Save changes
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>You don&apos;t have permission to edit this resource</TooltipContent>
    </Tooltip>
  )
};
