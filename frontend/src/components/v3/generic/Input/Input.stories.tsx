import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchIcon } from "lucide-react";
import { fn } from "storybook/test";

import { Button } from "@app/components/v3/generic";

import { Input } from "./Input";

const meta = {
  title: "Generic/Input",
  component: Input,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "inline-radio", options: ["xs", "sm", "md", "lg"] },
    isDisabled: { control: "boolean" },
    isFullWidth: { control: "boolean" },
    isRounded: { control: "boolean" }
  },
  args: {
    onClick: fn(),
    placeholder: "Placeholder",
    size: "md",
    isFullWidth: false,
    isDisabled: false,
    isRounded: true
  },
  decorators: (Story) => {
    return (
      <div className="flex w-[240px] justify-center">
        <Story />
      </div>
    );
  }
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExtraSmall: Story = {
  name: "Size: Extra Small",
  args: {
    size: "xs"
  }
};

export const Small: Story = {
  name: "Size: Small",
  args: {
    size: "sm"
  }
};

export const Medium: Story = {
  name: "Size: Medium",
  args: {
    size: "md"
  }
};

export const Large: Story = {
  name: "Size: Large",
  args: {
    size: "lg"
  }
};

export const IsDisabled: Story = {
  name: "State: isDisabled",
  args: {
    isDisabled: true
  }
};

export const IsError: Story = {
  name: "State: isError",
  args: {
    isError: true
  }
};

export const IsReadOnly: Story = {
  name: "State: isReadOnly",
  args: {
    isReadOnly: true,
    value: "Can't touch this!"
  }
};

export const IsFullWidth: Story = {
  name: "State: isFullWidth",
  args: {
    isFullWidth: true
  }
};

export const StartAdornment: Story = {
  name: "Adornment: Start",
  args: {
    startAdornment: <SearchIcon />,
    placeholder: "Search..."
  }
};

export const EndAdornment: Story = {
  name: "Adornment: End",
  args: {
    endAdornment: <Button variant="outline">F</Button>,
    placeholder: "Find..."
  }
};
