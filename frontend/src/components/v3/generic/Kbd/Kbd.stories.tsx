import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowLeftIcon, CornerDownLeftIcon } from "lucide-react";

import { Kbd, KbdGroup } from "./Kbd";

/**
 * `Kbd` displays a keyboard key or shortcut as non-interactive instructional content.
 * Use `KbdGroup` to keep multiple keycaps together.
 */
const meta = {
  title: "Generic/Kbd",
  component: Kbd,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    className: {
      table: { disable: true }
    },
    children: {
      table: { disable: true }
    }
  },
  args: {
    children: "Esc"
  }
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Shortcut: Story = {
  name: "Example: Shortcut",
  render: () => (
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <span aria-hidden="true" className="px-0.5 text-xs text-muted">
        +
      </span>
      <Kbd>K</Kbd>
    </KbdGroup>
  )
};

export const IconKeys: Story = {
  name: "Example: Icon Keys",
  render: () => (
    <KbdGroup>
      <Kbd aria-label="Left Arrow">
        <ArrowLeftIcon aria-hidden="true" className="size-3" />
      </Kbd>
      <Kbd aria-label="Enter">
        <CornerDownLeftIcon aria-hidden="true" className="size-3" />
      </Kbd>
    </KbdGroup>
  )
};

export const InInstruction: Story = {
  name: "Example: Instruction",
  render: () => (
    <div className="flex items-center gap-1.5 text-xs text-muted">
      <Kbd>Esc</Kbd>
      <span>Close</span>
    </div>
  )
};
