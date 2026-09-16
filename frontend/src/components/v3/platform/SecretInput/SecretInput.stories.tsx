import type { Meta, StoryObj } from "@storybook/react-vite";

import { SecretInput } from "./SecretInput";

const meta = {
  title: "Platform/SecretInput",
  component: SecretInput,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "plain"]
    },
    value: {
      control: "text"
    },
    containerClassName: {
      table: { disable: true }
    }
  },
  args: {
    onChange: () => undefined,
    value: "secret-value",
    variant: "default"
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    )
  ],
  globals: {
    backgrounds: { value: "card" }
  }
} satisfies Meta<typeof SecretInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Use the framed variant for secret values in forms."
      }
    }
  }
};

export const Plain: Story = {
  args: {
    variant: "plain"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use the plain variant for inline editing where the surrounding surface already provides the field boundary, such as an editable table cell."
      }
    }
  }
};
