import type { Meta, StoryObj } from "@storybook/react-vite";

import { ScopeBadge } from "./ScopeBadge";

const meta = {
  title: "Platform/ScopeBadge",
  component: ScopeBadge,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["org", "namespace"]
    },
    size: {
      control: "inline-radio",
      options: ["sm", "md", "lg"]
    }
  },
  args: {
    size: "md"
  }
} satisfies Meta<typeof ScopeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Organization: Story = {
  args: {
    variant: "org"
  }
};

export const Namespace: Story = {
  args: {
    variant: "namespace"
  }
};
