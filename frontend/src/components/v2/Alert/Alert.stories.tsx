import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Meta, StoryObj } from "@storybook/react";

import { Alert, AlertDescription, AlertTitle } from "./Alert";

const meta: Meta<typeof Alert> = {
  title: "Components/Alert",
  component: Alert,
  tags: ["v2"]
};

export default meta;

type Story = StoryObj<typeof Alert>;

const ExampleComponent = () => (
  <>
    <AlertTitle>this is a title</AlertTitle>
    <AlertDescription>this is a description</AlertDescription>
  </>
);

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

export const Destructive: Story = {
  args: {
    children: <ExampleComponent />,
    variant: "destructive"
  }
};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <FontAwesomeIcon icon={faTriangleExclamation} />
        <ExampleComponent />
      </>
    ),
    variant: "warning"
  }
};
