import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { Label } from "../Label/Label";
import { Checkbox } from "./Checkbox";

const meta = {
  title: "Generic/Checkbox",
  component: Checkbox,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    checked: {
      control: "boolean",
      description: "The controlled checked state of the checkbox"
    },
    defaultChecked: {
      control: "boolean",
      description: "The default checked state when uncontrolled"
    },
    disabled: {
      control: "boolean",
      description: "When true, prevents the user from interacting with the checkbox"
    },
    required: {
      control: "boolean",
      description: "When true, indicates that the user must check the checkbox before submitting"
    },
    name: {
      control: "text",
      description: "The name of the checkbox for form submission"
    }
  },
  args: {
    onCheckedChange: fn(),
    disabled: false,
    required: false
  },
  decorators: (Story: any) => {
    return (
      <div className="flex w-full max-w-lg justify-center">
        <Story />
      </div>
    );
  }
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {}
};

export const Checked: Story = {
  name: "State: Checked",
  args: {
    defaultChecked: true
  }
};

export const Unchecked: Story = {
  name: "State: Unchecked",
  args: {
    defaultChecked: false
  }
};

export const Disabled: Story = {
  name: "State: Disabled",
  args: {
    disabled: true
  }
};

export const DisabledChecked: Story = {
  name: "State: Disabled & Checked",
  args: {
    disabled: true,
    defaultChecked: true
  }
};

export const Required: Story = {
  name: "State: Required",
  args: {
    required: true
  }
};

export const WithLabel: Story = {
  name: "Example: With Label",
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox {...args} id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  )
};

export const WithLabelAndDescription: Story = {
  name: "Example: With Label & Description",
  render: (args) => (
    <div className="flex items-start gap-2">
      <Checkbox {...args} id="marketing" />
      <div className="grid gap-1.5 leading-none">
        <Label htmlFor="marketing">Marketing emails</Label>
        <p className="text-sm text-muted-foreground">
          You can enable or disable notifications at any time.
        </p>
      </div>
    </div>
  ),
  decorators: (Story) => {
    return (
      <div className="flex w-[400px] justify-start p-4">
        <Story />
      </div>
    );
  }
};
