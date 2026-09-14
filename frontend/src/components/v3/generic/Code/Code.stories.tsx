import type { Meta, StoryObj } from "@storybook/react-vite";

import { Code } from "./Code";

const meta = {
  title: "Generic/Code",
  component: Code,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "plain"]
    }
  },
  args: {
    children: "INFISICAL_{{secretKey}}"
  }
} satisfies Meta<typeof Code>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Plain: Story = {
  args: {
    variant: "plain"
  }
};

export const InlineContext: Story = {
  render: () => (
    <p className="max-w-md text-sm leading-relaxed">
      A path of <Code>/demo/path/</Code> and a key schema of{" "}
      <Code>INFISICAL_{"{{secretKey}}"}</Code> produce{" "}
      <Code>/demo/path/INFISICAL_{"{{secretKey}}"}</Code>.
    </p>
  )
};
