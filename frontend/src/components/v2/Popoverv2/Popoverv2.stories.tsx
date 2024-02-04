import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "../Button";
import { Popover, PopoverContent, PopoverContentProps, PopoverTrigger } from "./Popoverv2";

const meta: Meta<typeof PopoverContent> = {
  title: "Components/Popover",
  component: Popover,
  tags: ["v2"]
};

export default meta;
type Story = StoryObj<typeof PopoverContent>;

const Template = (args: PopoverContentProps) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button>Hello world</Button>
    </PopoverTrigger>
    <PopoverContent {...args} side="bottom" sideOffset={10}>
      <h1>This is popper</h1>
    </PopoverContent>
  </Popover>
);

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
export const Primary: Story = {
  render: (args) => <Template {...args} />
};
