import type { Meta, StoryObj } from "@storybook/react-vite";

import { CodeBlock } from "./CodeBlock";

const meta = {
  title: "Generic/CodeBlock",
  component: CodeBlock,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Command",
    value: "infisical gateway start example --enroll-method=token --domain=http://localhost:8080"
  }
};

export const WithoutLabel: Story = {
  args: {
    value: "sudo systemctl start infisical-relay"
  }
};
