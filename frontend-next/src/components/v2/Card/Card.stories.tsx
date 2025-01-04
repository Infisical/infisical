import type { Meta, StoryObj } from "@storybook/react";

import { Card, CardBody, CardFooter, CardProps, CardTitle } from "./Card";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
  tags: ["v2"],
  argTypes: {
    isRounded: {
      type: "boolean",
      defaultValue: true
    }
  }
};

export default meta;
type Story = StoryObj<typeof Card>;

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
const Template = (args: CardProps) => (
  <div className="w-96">
    <Card {...args}>
      <CardTitle subTitle="Please add your subtitle here">Title</CardTitle>
      <CardBody>Content</CardBody>
      <CardFooter>Footer</CardFooter>
    </Card>
  </div>
);

export const Basic: Story = {
  render: (args) => <Template {...args} />
};

export const Hoverable: Story = {
  render: (args) => <Template {...args} />,
  args: {
    isHoverable: true
  }
};
