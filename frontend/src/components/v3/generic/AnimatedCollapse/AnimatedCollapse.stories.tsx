import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../Button";
import { Field, FieldDescription, FieldLabel } from "../Field";
import { Input } from "../Input";
import { AnimatedCollapse } from "./AnimatedCollapse";

const meta = {
  title: "Generic/AnimatedCollapse",
  component: AnimatedCollapse,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "subtle"]
    }
  },
  parameters: {
    docs: {
      description: {
        component:
          "Animates a stable block of content when boolean state reveals or hides it. Children remain mounted while collapsed, so local state, effects, subscriptions, and form registration continue. Callers must own hidden-field validation and side effects. Use Accordion when the disclosure owns its trigger; this component does not animate arbitrary height changes while already open."
      }
    }
  }
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

export const Subtle: Story = {
  name: "Variant: Subtle",
  args: {
    isOpen: false,
    variant: "subtle"
  },
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div className="flex w-80 flex-col gap-2">
        <Button onClick={() => setIsOpen((current) => !current)}>
          {isOpen ? "Hide helper text" : "Show helper text"}
        </Button>
        <AnimatedCollapse {...args} isOpen={isOpen}>
          <p className="text-xs text-muted">
            Use subtle motion for helper text, validation feedback, and other compact content.
          </p>
        </AnimatedCollapse>
      </div>
    );
  }
};

export const PreservesMountedState: Story = {
  name: "Behavior: Preserves Mounted State",
  args: {
    isOpen: false
  },
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(true);

    return (
      <div className="flex w-80 flex-col gap-2">
        <Button onClick={() => setIsOpen((current) => !current)}>
          {isOpen ? "Hide field" : "Show field"}
        </Button>
        <AnimatedCollapse {...args} isOpen={isOpen}>
          <Field className="py-2">
            <FieldLabel htmlFor="persistent-value">Persistent value</FieldLabel>
            <Input id="persistent-value" placeholder="Type something" />
            <FieldDescription>
              Type a value, collapse the section, then expand it. The value remains because children
              stay mounted.
            </FieldDescription>
          </Field>
        </AnimatedCollapse>
      </div>
    );
  }
};
