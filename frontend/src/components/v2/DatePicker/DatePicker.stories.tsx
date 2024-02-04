import type { Meta, StoryObj } from "@storybook/react";

import { DatePicker } from "./DatePicker";

const meta: Meta<typeof DatePicker> = {
  title: "Components/DatePicker",
  component: DatePicker,
  tags: ["v2"],
  argTypes: {}
};

export default meta;
type Story = StoryObj<typeof DatePicker>;

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
export const Primary: Story = {
  args: {}
};
