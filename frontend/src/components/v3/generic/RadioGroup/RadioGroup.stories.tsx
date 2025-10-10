import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { Label } from "../Label";
import { RadioGroup, RadioGroupItem } from "./RadioGroup";

const meta = {
  title: "Generic/RadioGroup",
  component: RadioGroup,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    onValueChange: fn(),
    children: (
      <>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option1" id="option1" />
          <Label htmlFor="option1">Option 1</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option2" id="option2" />
          <Label htmlFor="option2">Option 2</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option3" id="option3" />
          <Label htmlFor="option3">Option 3</Label>
        </div>
      </>
    )
  }
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDefaultValue: Story = {
  name: "Example: With Default Value",
  args: {
    defaultValue: "option2"
  }
};

export const WithDescriptions: Story = {
  name: "Example: With Descriptions",
  args: {
    className: "gap-4",
    children: (
      <>
        <div className="flex items-start gap-2">
          <RadioGroupItem value="free" id="free" className="mt-1" />
          <div className="grid gap-1">
            <Label htmlFor="free">Free Plan</Label>
            <p className="text-sm text-muted-foreground">Basic features for personal use</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <RadioGroupItem value="pro" id="pro" className="mt-1" />
          <div className="grid gap-1">
            <Label htmlFor="pro">Pro Plan</Label>
            <p className="text-sm text-muted-foreground">Advanced features for professionals</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <RadioGroupItem value="enterprise" id="enterprise" className="mt-1" />
          <div className="grid gap-1">
            <Label htmlFor="enterprise">Enterprise Plan</Label>
            <p className="text-sm text-muted-foreground">Custom solutions for organizations</p>
          </div>
        </div>
      </>
    )
  }
};

export const Disabled: Story = {
  name: "Example: Disabled",
  args: {
    disabled: true,
    defaultValue: "option1"
  }
};

export const DisabledItem: Story = {
  name: "Example: Disabled Item",
  args: {
    defaultValue: "option1",
    children: (
      <>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option1" id="option1" />
          <Label htmlFor="option1">Available Option</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option2" id="option2" disabled />
          <Label htmlFor="option2" className="opacity-50">
            Disabled Option
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option3" id="option3" />
          <Label htmlFor="option3">Another Available Option</Label>
        </div>
      </>
    )
  }
};

export const HorizontalLayout: Story = {
  name: "Example: Horizontal Layout",
  args: {
    className: "flex gap-6",
    children: (
      <>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="yes" id="yes" />
          <Label htmlFor="yes">Yes</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="no" id="no" />
          <Label htmlFor="no">No</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="maybe" id="maybe" />
          <Label htmlFor="maybe">Maybe</Label>
        </div>
      </>
    )
  }
};

export const FormExample: Story = {
  name: "Example: Form Usage",
  render: () => (
    <div className="w-[350px] space-y-4 text-foreground">
      <div>
        <h3 className="text-lg font-medium">Notification Preferences</h3>
        <p className="text-sm text-muted-foreground">
          How would you like to receive notifications?
        </p>
      </div>
      <RadioGroup defaultValue="email" className="gap-4">
        <div className="flex items-start gap-2">
          <RadioGroupItem value="email" id="email" className="mt-1" />
          <div className="grid gap-1">
            <Label htmlFor="email">Email</Label>
            <p className="text-sm text-muted-foreground">Receive notifications via email</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <RadioGroupItem value="sms" id="sms" className="mt-1" />
          <div className="grid gap-1">
            <Label htmlFor="sms">SMS</Label>
            <p className="text-sm text-muted-foreground">Receive notifications via text message</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <RadioGroupItem value="push" id="push" className="mt-1" />
          <div className="grid gap-1">
            <Label htmlFor="push">Push Notifications</Label>
            <p className="text-sm text-muted-foreground">Receive notifications in the app</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <RadioGroupItem value="none" id="none" className="mt-1" />
          <div className="grid gap-1">
            <Label htmlFor="none">None</Label>
            <p className="text-sm text-muted-foreground">Don&apos;t receive any notifications</p>
          </div>
        </div>
      </RadioGroup>
    </div>
  )
};

export const InvalidState: Story = {
  name: "Example: Invalid State",
  args: {
    children: (
      <>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option1" id="option1-invalid" aria-invalid />
          <Label htmlFor="option1-invalid">Option 1</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option2" id="option2-invalid" aria-invalid />
          <Label htmlFor="option2-invalid">Option 2</Label>
        </div>
        <p className="text-sm text-danger">Please select an option</p>
      </>
    )
  }
};
