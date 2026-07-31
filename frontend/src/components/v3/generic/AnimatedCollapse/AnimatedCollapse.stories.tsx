import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../Button";
import { AnimatedCollapse } from "./AnimatedCollapse";

const meta = {
  title: "Generic/AnimatedCollapse",
  component: AnimatedCollapse,
  tags: ["autodocs"]
} satisfies Meta<typeof AnimatedCollapse>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Conditional Content",
  args: {
    isOpen: false
  },
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div className="flex w-80 flex-col gap-2">
        <Button onClick={() => setIsOpen((current) => !current)}>
          {isOpen ? "Hide Content" : "Show Content"}
        </Button>
        <AnimatedCollapse {...args} isOpen={isOpen}>
          <div className="rounded-md border border-border bg-container p-4 text-sm text-foreground">
            Conditionally displayed content expands and collapses without requiring an accordion
            trigger.
          </div>
        </AnimatedCollapse>
      </div>
    );
  }
};
