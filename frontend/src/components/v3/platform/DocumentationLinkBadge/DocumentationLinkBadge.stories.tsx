import type { Meta, StoryObj } from "@storybook/react-vite";

import { DocumentationLinkBadge } from "./DocumentationLinkBadge";

/**
 * The documentation link badge is a re-usable component to link to Infisical documentation references.
 */
const meta = {
  title: "Platform/Documentation Link Badge",
  component: DocumentationLinkBadge,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {},
  args: { href: "https://infisical.com/docs/documentation/getting-started/introduction" }
} satisfies Meta<typeof DocumentationLinkBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default"
};
