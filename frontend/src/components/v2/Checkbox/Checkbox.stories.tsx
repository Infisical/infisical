import type { Meta, StoryObj } from "@storybook/react";

import { Checkbox } from "./Checkbox";

const meta: Meta<typeof Checkbox> = {
  title: "Components/Checkbox",
  component: Checkbox,
  tags: ["v2"],
  argTypes: {}
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
export const Simple: Story = {
  args: {
    children: "Accept the condition"
  }
};

export const Disabled: Story = {
  args: {
    children: "Accept the condition",
    isDisabled: true
  }
};

export const Required: Story = {
  args: {
    children: "Accept the condition",
    isRequired: true
  }
};
