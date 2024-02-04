import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Meta, StoryObj } from "@storybook/react";

import { IconButton } from "./IconButton";

const meta: Meta<typeof IconButton> = {
  title: "Components/IconButton",
  component: IconButton,
  tags: ["v2"],
  argTypes: {
    isRounded: {
      defaultValue: true,
      type: "boolean"
    },
    ariaLabel: {
      defaultValue: "Some buttons..."
    }
  }
};

export default meta;
type Story = StoryObj<typeof IconButton>;

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
export const Primary: Story = {
  args: {
    children: <FontAwesomeIcon icon={faPlus} />
  }
};

export const Secondary: Story = {
  args: {
    children: <FontAwesomeIcon icon={faPlus} />,
    colorSchema: "secondary",
    variant: "outline"
  }
};

export const Danger: Story = {
  args: {
    children: <FontAwesomeIcon icon={faPlus} />,
    colorSchema: "danger",
    variant: "solid"
  }
};

export const Plain: Story = {
  args: {
    children: <FontAwesomeIcon icon={faPlus} />,
    variant: "plain"
  }
};

export const Disabled: Story = {
  args: {
    children: <FontAwesomeIcon icon={faPlus} />,
    disabled: true
  }
};
