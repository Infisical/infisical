import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  tags: ["v2"],
  argTypes: {
    isRounded: {
      defaultValue: true,
      type: "boolean"
    },
    isFullWidth: {
      defaultValue: false,
      type: "boolean"
    }
  }
};

export default meta;
type Story = StoryObj<typeof Button>;

// More on writing stories with args: https://storybook.js.org/docs/7.0/react/writing-stories/args
export const Primary: Story = {
  args: {
    children: "Hello Infisical"
  }
};

export const Secondary: Story = {
  args: {
    children: "Hello Infisical",
    colorSchema: "secondary",
    variant: "outline"
  }
};

export const Star: Story = {
  args: {
    children: "Hello Infisical",
    variant: "star"
  }
};

export const Danger: Story = {
  args: {
    children: "Hello Infisical",
    colorSchema: "danger",
    variant: "solid"
  }
};

export const Plain: Story = {
  args: {
    children: "Hello Infisical",
    variant: "plain"
  }
};

export const Disabled: Story = {
  args: {
    children: "Hello Infisical",
    disabled: true
  }
};

export const FullWidth: Story = {
  args: {
    children: "Hello Infisical",
    isFullWidth: true
  }
};

export const Loading: Story = {
  args: {
    children: "Hello Infisical",
    isLoading: true
  }
};

export const LeftIcon: Story = {
  args: {
    children: "Hello Infisical",
    leftIcon: <FontAwesomeIcon icon={faPlus} className="pr-0.5" />
  }
};

export const RightIcon: Story = {
  args: {
    children: "Hello Infisical",
    rightIcon: <FontAwesomeIcon icon={faPlus} className="pr-0.5" />
  }
};
