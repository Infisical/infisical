import type { Meta, StoryObj } from "@storybook/react-vite";

import { AccessRestrictedNotice } from "./AccessRestrictedNotice";

const meta = {
  title: "Platform/Access Restricted Notice",
  component: AccessRestrictedNotice,
  parameters: {
    layout: "padded"
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-4xl">
        <Story />
      </div>
    )
  ],
  tags: ["autodocs"]
} satisfies Meta<typeof AccessRestrictedNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Use for a single restricted section inside an otherwise usable page; it sits where the section's content would go. Page- and tab-level gates use AccessRestrictedDialog instead."
      }
    }
  }
};

export const CustomCopy: Story = {
  name: "Example: Custom Copy",
  args: {
    title: "Audit Logs Restricted",
    description: "Your role doesn't include permission to view this user's audit logs."
  },
  parameters: {
    docs: {
      description: {
        story: "Override the title and description when the section has a more specific message."
      }
    }
  }
};
