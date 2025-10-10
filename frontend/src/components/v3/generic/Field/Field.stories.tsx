import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoIcon } from "lucide-react";

import { Button } from "../Button";
import { Checkbox } from "../Checkbox";
import { Input } from "../Input";
import { RadioGroup, RadioGroupItem } from "../RadioGroup/RadioGroup";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle
} from "./Field";

const meta = {
  title: "Generic/Field",
  component: Field,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "select",
      options: ["vertical", "horizontal", "responsive"]
    }
  },
  decorators: (Story: any) => {
    return (
      <div className="flex w-[600px] justify-center">
        <Story />
      </div>
    );
  }
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VerticalField: Story = {
  name: "Orientation: Vertical",
  render: (args) => (
    <Field {...args} orientation="vertical">
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <FieldContent>
        <Input id="email" type="email" placeholder="Enter your email" />
        <FieldDescription>We&apos;ll never share your email with anyone else.</FieldDescription>
      </FieldContent>
    </Field>
  )
};

export const HorizontalField: Story = {
  name: "Orientation: Horizontal",
  render: (args) => (
    <Field {...args} orientation="horizontal">
      <FieldLabel htmlFor="username">Username</FieldLabel>
      <FieldContent>
        <Input id="username" type="text" placeholder="Enter username" />
        <FieldDescription>Choose a unique username for your account.</FieldDescription>
      </FieldContent>
    </Field>
  )
};

export const ResponsiveField: Story = {
  name: "Orientation: Responsive",
  render: (args) => (
    <FieldGroup>
      <Field {...args} orientation="responsive">
        <FieldLabel htmlFor="fullname">Full Name</FieldLabel>
        <FieldContent>
          <Input id="fullname" type="text" placeholder="Enter your full name" />
          <FieldDescription>Enter your first and last name.</FieldDescription>
        </FieldContent>
      </Field>
    </FieldGroup>
  )
};

export const WithError: Story = {
  render: (args) => (
    <Field {...args} data-invalid="true">
      <FieldLabel htmlFor="password">Password</FieldLabel>
      <FieldContent>
        <Input id="password" type="password" placeholder="Enter password" isError />
        <FieldError>Password must be at least 8 characters long.</FieldError>
      </FieldContent>
    </Field>
  )
};

export const WithMultipleErrors: Story = {
  render: (args) => (
    <Field {...args} data-invalid="true">
      <FieldLabel htmlFor="password-multi">Password</FieldLabel>
      <FieldContent>
        <Input id="password-multi" type="password" placeholder="Enter password" isError />
        <FieldError
          errors={[
            { message: "Password must be at least 8 characters long" },
            { message: "Password must contain at least one uppercase letter" },
            { message: "Password must contain at least one number" }
          ]}
        />
      </FieldContent>
    </Field>
  )
};

export const WithCheckbox: Story = {
  render: (args) => (
    <Field {...args}>
      <FieldLabel htmlFor="terms" className="flex items-center gap-2">
        <Checkbox id="terms" />
        <span>Accept terms and conditions</span>
      </FieldLabel>
      <FieldDescription>You must agree to our terms and conditions to continue.</FieldDescription>
    </Field>
  )
};

export const WithLabelIcon: Story = {
  render: (args) => (
    <Field {...args}>
      <FieldLabel htmlFor="api-key">
        API Key
        <InfoIcon className="size-4 text-muted-foreground" />
      </FieldLabel>
      <FieldContent>
        <Input id="api-key" type="text" placeholder="Enter your API key" />
        <FieldDescription>Your API key can be found in your account settings.</FieldDescription>
      </FieldContent>
    </Field>
  )
};

export const FieldGroupExample: Story = {
  name: "Field Group",
  render: (args) => (
    <FieldGroup>
      <Field {...args}>
        <FieldLabel htmlFor="first-name">First Name</FieldLabel>
        <FieldContent>
          <Input id="first-name" type="text" placeholder="John" />
        </FieldContent>
      </Field>
      <Field {...args}>
        <FieldLabel htmlFor="last-name">Last Name</FieldLabel>
        <FieldContent>
          <Input id="last-name" type="text" placeholder="Doe" />
        </FieldContent>
      </Field>
      <Field {...args}>
        <FieldLabel htmlFor="email-group">Email</FieldLabel>
        <FieldContent>
          <Input id="email-group" type="email" placeholder="john.doe@example.com" />
          <FieldDescription>We&apos;ll use this email for account verification.</FieldDescription>
        </FieldContent>
      </Field>
    </FieldGroup>
  )
};

export const FieldChoiceCardsExample: Story = {
  name: "Field Choice Cards",
  render: () => (
    <div className="w-full max-w-md">
      <FieldGroup>
        <FieldSet>
          <FieldLabel htmlFor="compute-environment-p8w">Compute Environment</FieldLabel>
          <FieldDescription>Select the compute environment for your cluster.</FieldDescription>
          <RadioGroup defaultValue="kubernetes">
            <FieldLabel htmlFor="kubernetes-r2h">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Kubernetes</FieldTitle>
                  <FieldDescription>
                    Run GPU workloads on a K8s configured cluster.
                  </FieldDescription>
                </FieldContent>
                <RadioGroupItem value="kubernetes" id="kubernetes-r2h" />
              </Field>
            </FieldLabel>
            <FieldLabel htmlFor="vm-z4k">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Virtual Machine</FieldTitle>
                  <FieldDescription>
                    Access a VM configured cluster to run GPU workloads.
                  </FieldDescription>
                </FieldContent>
                <RadioGroupItem value="vm" id="vm-z4k" />
              </Field>
            </FieldLabel>
          </RadioGroup>
        </FieldSet>
      </FieldGroup>
    </div>
  )
};

export const FieldSetExample: Story = {
  name: "Field Set",
  render: (args) => (
    <FieldSet>
      <FieldLegend>Account Settings</FieldLegend>
      <FieldDescription>Update your account settings and preferences.</FieldDescription>
      <FieldGroup>
        <Field {...args}>
          <FieldLabel htmlFor="display-name">Display Name</FieldLabel>
          <FieldContent>
            <Input id="display-name" type="text" placeholder="Enter display name" />
          </FieldContent>
        </Field>
        <Field {...args}>
          <FieldLabel htmlFor="bio">Bio</FieldLabel>
          <FieldContent>
            <Input id="bio" type="text" placeholder="Tell us about yourself" />
            <FieldDescription>Brief description for your profile.</FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </FieldSet>
  )
};

export const WithSeparator: Story = {
  render: (args) => (
    <FieldGroup>
      <Field {...args}>
        <FieldLabel htmlFor="current-password">Current Password</FieldLabel>
        <FieldContent>
          <Input id="current-password" type="password" placeholder="Enter current password" />
        </FieldContent>
      </Field>
      <FieldSeparator>Change Password</FieldSeparator>
      <Field {...args}>
        <FieldLabel htmlFor="new-password">New Password</FieldLabel>
        <FieldContent>
          <Input id="new-password" type="password" placeholder="Enter new password" />
        </FieldContent>
      </Field>
      <Field {...args}>
        <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
        <FieldContent>
          <Input id="confirm-password" type="password" placeholder="Confirm new password" />
        </FieldContent>
      </Field>
    </FieldGroup>
  )
};

export const FormExample: Story = {
  name: "Complete Form Example",
  render: (args) => (
    <form className="w-full">
      <FieldSet>
        <FieldLegend>Create Account</FieldLegend>
        <FieldDescription>Fill in the form below to create your account.</FieldDescription>
        <FieldGroup>
          <Field {...args}>
            <FieldLabel htmlFor="form-email">Email Address</FieldLabel>
            <FieldContent>
              <Input id="form-email" type="email" placeholder="you@example.com" isRequired />
              <FieldDescription>
                We&apos;ll send a verification link to this email.
              </FieldDescription>
            </FieldContent>
          </Field>
          <Field {...args}>
            <FieldLabel htmlFor="form-password">Password</FieldLabel>
            <FieldContent>
              <Input id="form-password" type="password" placeholder="***********" isRequired />
              <FieldDescription>Must be at least 8 characters long.</FieldDescription>
            </FieldContent>
          </Field>
          <Field {...args}>
            <FieldLabel htmlFor="form-confirm-password">Confirm Password</FieldLabel>
            <FieldContent>
              <Input
                id="form-confirm-password"
                type="password"
                placeholder="***********"
                isRequired
              />
            </FieldContent>
          </Field>
          <FieldSeparator />
          <Field {...args}>
            <FieldLabel htmlFor="form-terms" className="flex items-center gap-2">
              <Checkbox id="form-terms" />
              <span>I agree to the terms and conditions</span>
            </FieldLabel>
          </Field>
          <Button type="submit" isFullWidth>
            Create Account
          </Button>
        </FieldGroup>
      </FieldSet>
    </form>
  )
};

export const WithFieldTitle: Story = {
  render: (args) => (
    <Field {...args}>
      <FieldTitle>
        Notification Preferences
        <InfoIcon className="size-4" />
      </FieldTitle>
      <FieldContent>
        <FieldDescription>Choose how you want to receive notifications.</FieldDescription>
        <div className="flex flex-col gap-3 pt-2">
          <FieldLabel htmlFor="email-notif" className="flex items-center gap-2">
            <Checkbox id="email-notif" />
            <span>Email notifications</span>
          </FieldLabel>
          <FieldLabel htmlFor="push-notif" className="flex items-center gap-2">
            <Checkbox id="push-notif" />
            <span>Push notifications</span>
          </FieldLabel>
        </div>
      </FieldContent>
    </Field>
  )
};
