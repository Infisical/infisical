import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@app/components/v3/generic";

import { Tooltip, TooltipProvider } from "./Tooltip";

const meta = {
  title: "Generic/Tooltip",
  component: Tooltip,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    side: { control: "inline-radio", options: ["top", "bottom", "left", "right"] },
    align: { control: "inline-radio", options: ["start", "center", "end"] },
    isOpen: { control: "inline-radio", options: [true, false, undefined] },
    isDisabled: { control: "boolean" },
    delayDuration: { control: "number" },
    children: {
      table: {
        disable: true
      }
    }
  },
  args: {
    isOpen: true,
    isDisabled: false,
    delayDuration: 50,
    side: "top",
    align: "center",
    content: "Tooltip content",
    children: <Button variant="outline">Button</Button>
  },
  decorators: (Story) => {
    return (
      <div className="p-8">
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </div>
    );
  }
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Top: Story = {
  name: "Side: Top",
  args: {
    side: "top"
  }
};

export const Bottom: Story = {
  name: "Side: Bottom",
  args: {
    side: "bottom"
  }
};

export const Left: Story = {
  name: "Side: Left",
  args: {
    side: "left"
  }
};

export const Right: Story = {
  name: "Side: Right",
  args: {
    side: "right"
  }
};

export const Start: Story = {
  name: "Align: Start",
  args: {
    align: "start"
  }
};

export const Center: Story = {
  name: "Align: Center",
  args: {
    align: "center"
  }
};

export const End: Story = {
  name: "Align: End",
  args: {
    align: "end"
  }
};
