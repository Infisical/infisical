import type { Meta, StoryObj } from "@storybook/react";

import { Switch } from "./Switch";

const meta: Meta<typeof Switch> = {
  title: "Components/Switch",
  component: Switch,
  tags: ["v2"],
  argTypes: {}
};

export default meta;
type Story = StoryObj<typeof Switch>;

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
export const Simple: Story = {
  args: {
    children: "Dark mode"
  }
};

export const Disabled: Story = {
  args: {
    children: "Dark mode",
    isDisabled: true
  }
};

export const Required: Story = {
  args: {
    children: "Dark mode",
    isRequired: true
  }
};
