import type { Meta, StoryObj } from "@storybook/react";

// Be careful on dep cycle
import { Input } from "../Input/Input";
import { FormControl } from "./FormControl";

const meta: Meta<typeof FormControl> = {
  title: "Components/FormControl",
  component: FormControl,
  tags: ["v2"],
  argTypes: {}
};

export default meta;
type Story = StoryObj<typeof FormControl>;

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
export const Basic: Story = {
  args: {
    children: <Input />,
    label: "Email",
    id: "email",
    helperText: "Type something.."
  }
};

export const RequiredInput: Story = {
  args: {
    ...Basic.args,
    isRequired: true
  }
};

export const ErrorInput: Story = {
  args: {
    ...Basic.args,
    errorText: "Some random error",
    isError: true
  }
};
