import type { Meta, StoryObj } from "@storybook/react";

import { Skeleton } from "./Skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "Components/Skeleton",
  component: Skeleton,
  tags: ["v2"],
  argTypes: {}
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Basic: Story = {
  render: (args) => <Skeleton {...args} />
};
