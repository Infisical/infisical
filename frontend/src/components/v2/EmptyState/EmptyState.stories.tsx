import type { Meta, StoryObj } from "@storybook/react";

import { EmptyState } from "./EmptyState";

const meta: Meta<typeof EmptyState> = {
  title: "Components/EmptyState",
  component: EmptyState,
  tags: ["v2"],
  argTypes: {},
  args: {
    title: "No members found"
  }
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Basic: Story = {
  render: (args) => <EmptyState {...args} />
};
