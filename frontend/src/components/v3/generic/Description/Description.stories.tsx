import type { Meta, StoryObj } from "@storybook/react-vite";

import { Separator } from "../Separator";
import { Description, DescriptionContent, DescriptionHeader } from "./Description";

const meta = {
  title: "Generic/Description",
  component: Description,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    className: "grid gap-1",
    children: (
      <>
        <DescriptionHeader>Label</DescriptionHeader>
        <DescriptionContent>Content</DescriptionContent>
      </>
    )
  }
} satisfies Meta<typeof Description>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: "grid gap-1",
    children: (
      <>
        <DescriptionHeader>Email Address</DescriptionHeader>
        <DescriptionContent>john.doe@example.com</DescriptionContent>
      </>
    )
  }
};

export const WithSeparator: Story = {
  name: "Example: With Separator",
  render: () => (
    <div className="grid w-[400px] gap-3">
      <Description className="grid gap-1">
        <DescriptionHeader>Full Name</DescriptionHeader>
        <DescriptionContent>John Doe</DescriptionContent>
      </Description>
      <Separator />
      <Description className="grid gap-1">
        <DescriptionHeader>Email Address</DescriptionHeader>
        <DescriptionContent>john.doe@example.com</DescriptionContent>
      </Description>
    </div>
  )
};
