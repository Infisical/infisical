import type { Meta, StoryObj } from "@storybook/react";

import { Tooltip, TooltipProps, TooltipProvider } from "./Tooltip";

const meta: Meta<typeof Tooltip> = {
  title: "Components/Tooltip",
  component: Tooltip,
  tags: ["v2"],
  args: {
    content: "Hi"
  }
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

const Template = (args: TooltipProps) => (
  <TooltipProvider>
    <Tooltip {...args}>
      <div className="text-white">Hello infisical</div>
    </Tooltip>
  </TooltipProvider>
);

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
export const Primary: Story = {
  render: (args) => <Template {...args} />
};
