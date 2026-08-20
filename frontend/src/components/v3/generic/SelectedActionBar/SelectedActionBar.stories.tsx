import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../Button";
import { SelectedActionBar } from "./SelectedActionBar";

const meta = {
  title: "Generic/SelectedActionBar",
  component: SelectedActionBar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A viewport-fixed action bar for manipulating a multi-selection without shifting page content. Selection state and domain actions stay with the callsite."
      }
    }
  },
  args: {
    selectedCount: 3,
    onClearSelection: () => {},
    children: (
      <>
        <Button size="sm">Move</Button>
        <Button size="sm" variant="danger">
          Delete
        </Button>
      </>
    )
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <p className="text-sm text-accent">Scroll the page to verify viewport positioning.</p>
        <div className="h-[120vh]" />
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof SelectedActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Example: Story = {
  name: "Example: Multiple Selection Actions"
};

export const Hidden: Story = {
  name: "Example: No Selection",
  args: {
    selectedCount: 0
  }
};

export const EscapeClearsSelection: Story = {
  name: "Interaction: Escape clears selection",
  render: (args) => {
    const [selectedCount, setSelectedCount] = useState(args.selectedCount);

    return (
      <>
        <div className="fixed top-6 left-6 space-y-2 text-sm text-foreground">
          <p>Press Escape while this story is focused to clear the selection.</p>
          <Button size="sm" variant="outline" onClick={() => setSelectedCount(3)}>
            Restore selection
          </Button>
        </div>
        <SelectedActionBar
          {...args}
          selectedCount={selectedCount}
          onClearSelection={() => setSelectedCount(0)}
        />
      </>
    );
  }
};
