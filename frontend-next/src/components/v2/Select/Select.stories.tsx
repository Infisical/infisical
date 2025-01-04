import { useEffect, useState } from "react";
import { SelectProps } from "@radix-ui/react-select";
// eslint-disable-next-line import/no-extraneous-dependencies
import { Meta, StoryObj } from "@storybook/react";

import { Select, SelectItem } from "./Select";

const meta: Meta<typeof Select> = {
  title: "Components/Select",
  component: Select,
  tags: ["v2"],
  argTypes: {
    placeholder: {
      defaultValue: "Type something..."
    }
  }
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Basic: Story = {
  render: (args) => (
    <div className="">
      <Select placeholder="Type anything..." className="w-72" {...args}>
        <SelectItem value="1">John</SelectItem>
        <SelectItem value="2">Peter</SelectItem>
        <SelectItem value="3">Suzy</SelectItem>
      </Select>
    </div>
  )
};

const Controlled = (args: SelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState("");

  return (
    <div className="">
      <Select
        defaultValue="1"
        className="w-72"
        open={isOpen}
        onValueChange={(val) => setSelected(val)}
        value={selected}
        onOpenChange={(open) => setIsOpen(open)}
        {...args}
      >
        <SelectItem value="1">John</SelectItem>
        <SelectItem value="2">Peter</SelectItem>
        <SelectItem value="3">Suzy</SelectItem>
      </Select>
    </div>
  );
};

export const Control: Story = {
  render: (args) => <Controlled {...args} />
};

export const Disabled: Story = {
  render: (args) => (
    <div className="">
      <Select defaultValue="1" className="w-72" {...args}>
        <SelectItem value="1">John</SelectItem>
        <SelectItem value="2" isDisabled>
          Peter
        </SelectItem>
        <SelectItem value="3">Suzy</SelectItem>
      </Select>
    </div>
  )
};

export const Loading: Story = {
  render: (args) => (
    <div className="">
      <Select defaultValue="1" className="w-72" isLoading {...args}>
        <SelectItem value="1">John</SelectItem>
        <SelectItem value="2">Peter</SelectItem>
        <SelectItem value="3">Suzy</SelectItem>
      </Select>
    </div>
  )
};

const AsyncSelectOptions = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line no-new
    new Promise<void>((resolve): void => {
      setTimeout(() => {
        setIsLoading(false);
        resolve();
      }, 1000);
    });
  }, []);

  return (
    <div className="">
      <Select placeholder="Hello" className="w-72" isLoading={isLoading}>
        <SelectItem value="1">John</SelectItem>
        <SelectItem value="2">Peter</SelectItem>
        <SelectItem value="3">Suzy</SelectItem>
      </Select>
    </div>
  );
};

export const Async: Story = {
  render: (args) => <AsyncSelectOptions {...args} />
};
