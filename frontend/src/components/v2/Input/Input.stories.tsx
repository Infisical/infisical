import { faEye, faMailBulk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Meta, StoryObj } from "@storybook/react";

import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
  tags: ["v2"],
  argTypes: {
    isRounded: {
      defaultValue: true,
      type: "boolean"
    },
    placeholder: {
      defaultValue: "Type anything",
      type: "string"
    }
  }
};

export default meta;
type Story = StoryObj<typeof Input>;

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
export const Filled: Story = {
  args: {}
};

export const Outline: Story = {
  args: {
    variant: "outline"
  }
};

export const Plain: Story = {
  args: {
    variant: "plain"
  }
};

export const Error: Story = {
  args: {
    isError: true
  }
};

export const AutoWidth: Story = {
  args: {
    isFullWidth: false,
    className: "w-auto"
  }
};

export const RightIcon: Story = {
  args: {
    rightIcon: <FontAwesomeIcon icon={faEye} />
  }
};

export const LeftIcon: Story = {
  args: {
    leftIcon: <FontAwesomeIcon icon={faMailBulk} />
  }
};
