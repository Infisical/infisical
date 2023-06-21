// eslint-disable-next-line import/no-extraneous-dependencies
import { Meta, StoryObj } from "@storybook/react";

import { Button } from "../Button";
import { Modal, ModalContent, ModalContentProps, ModalTrigger } from "./Modal";

const meta: Meta<typeof Modal> = {
  title: "Components/Modal",
  component: Modal,
  tags: ["v2"],
  argTypes: {}
};

export default meta;
type Story = StoryObj<typeof ModalContent>;

const Template = (args: ModalContentProps) => (
  <Modal>
    <ModalTrigger asChild>
      <Button>Open</Button>
    </ModalTrigger>
    <ModalContent {...args}>Hello world</ModalContent>
  </Modal>
);

export const Basic: Story = {
  render: (args) => <Template {...args} />,
  args: {
    title: "Title",
    subTitle: "Something as subtitle",
    footerContent: "footer content"
  }
};
