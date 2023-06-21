import type { Meta, StoryObj } from "@storybook/react";

import { TextArea } from "./TextArea";

const meta: Meta<typeof TextArea> = {
  title: "Components/TextArea",
  component: TextArea,
  tags: ["v2"],
  argTypes: {
    placeholder: {
      defaultValue: "Type anything",
      type: "string"
    }
  }
};

export default meta;
type Story = StoryObj<typeof TextArea>;

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
export const Filled: Story = {
  args: {}
};

export const Outline: Story = {
  args: {
    variant: "outline"
  }
};

export const Plain: Story = {
  args: {
    variant: "plain"
  }
};

export const Error: Story = {
  args: {
    isError: true
  }
};

export const AutoWidth: Story = {
  args: {
    isFullWidth: false,
    className: "w-auto"
  }
};
