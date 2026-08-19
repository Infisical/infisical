import type { Meta, StoryObj } from "@storybook/react-vite";

import { AccessRestrictedBanner } from "./AccessRestrictedBanner";

/**
 * AccessRestrictedBanner is the dedicated full-surface permission-denied state. Use it when the
 * user can reach a page or section but their current role cannot view its contents.
 */
const meta = {
  title: "Platform/AccessRestrictedBanner",
  component: AccessRestrictedBanner,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"]
} satisfies Meta<typeof AccessRestrictedBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default"
};

export const CustomMessage: Story = {
  name: "Example: Custom Message",
  args: {
    body: "You do not have access to this application. Contact an administrator to request access."
  }
};
