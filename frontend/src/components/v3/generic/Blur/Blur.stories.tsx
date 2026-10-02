import type { Meta, StoryObj } from "@storybook/react-vite";

import { Blur } from "./Blur";

/**
 * `Blur` masks content that exists but cannot be disclosed to the current user.
 * Use it as a visual placeholder for restricted values, optionally explaining
 * the restriction with a tooltip.
 */
const meta = {
  title: "Generic/Blur",
  component: Blur,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    className: {
      table: { disable: true }
    }
  }
} satisfies Meta<typeof Blur>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    "aria-label": "Restricted value"
  }
};

export const WithTooltip: Story = {
  args: {
    "aria-label": "Restricted value",
    tooltipText: "You do not have permission to view this value."
  }
};
