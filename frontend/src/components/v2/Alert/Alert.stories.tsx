import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Meta, StoryObj } from "@storybook/react";

import { Alert, AlertDescription } from "./Alert";

const meta: Meta<typeof Alert> = {
  title: "Components/Alert",
  component: Alert,
  tags: ["v2"]
};

export default meta;

type Story = StoryObj<typeof Alert>;

const ExampleComponent = () => <AlertDescription>this is a description</AlertDescription>;

export const Default: Story = {
  args: {
    children: <ExampleComponent />
  }
};

export const Warning: Story = {
  args: {
    children: <ExampleComponent />,
    variant: "warning"
  }
};

export const Danger: Story = {
  args: {
    children: <ExampleComponent />,
    variant: "danger"
  }
};

export const WithCustomIcon: Story = {
  args: {
    children: <ExampleComponent />,
    variant: "warning",
    icon: <FontAwesomeIcon icon={faPlus} />
  }
};

export const WithOutIcon: Story = {
  args: {
    children: <ExampleComponent />,
    variant: "warning",
    icon: null
  }
};

export const WithOutTitle: Story = {
  args: {
    children: <ExampleComponent />,
    variant: "warning",
    hideTitle: true
  }
};
