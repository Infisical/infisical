import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "../Button";
import { Drawer, DrawerContent, DrawerContentProps, DrawerTrigger } from "./Drawer";

const meta: Meta<typeof Drawer> = {
  title: "Components/Drawer",
  component: Drawer,
  tags: ["v2"],
  argTypes: {}
};

export default meta;
type Story = StoryObj<typeof DrawerContent>;

const Template = (args: DrawerContentProps) => (
  <Drawer>
    <DrawerTrigger asChild>
      <Button>Open</Button>
    </DrawerTrigger>
    <DrawerContent {...args}>Hello world</DrawerContent>
  </Drawer>
);

export const Basic: Story = {
  render: (args) => <Template {...args} />,
  args: {
    title: "Title",
    subTitle: "Something as subtitle",
    footerContent: "footer content"
  }
};
