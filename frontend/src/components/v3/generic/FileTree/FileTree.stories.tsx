import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlusIcon, TrashIcon } from "lucide-react";

import { Button } from "../Button";
import { IconButton } from "../IconButton";
import { FileTree, type FileTreeProps } from "./FileTree";

const PATHS = [
  "README.md",
  "docs/setup.md",
  "docs/reference/api.md",
  "scripts/build.sh",
  "scripts/check.sh"
];

const SelectableTree = ({ paths, ...props }: FileTreeProps) => {
  const [selectedPath, setSelectedPath] = useState<string | null>(paths[0] ?? null);
  return (
    <FileTree {...props} paths={paths} selectedPath={selectedPath} onSelect={setSelectedPath} />
  );
};

const meta = {
  title: "Generic/FileTree",
  component: FileTree,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  render: (args) => <SelectableTree {...args} />,
  decorators: [
    (Story) => (
      <div className="h-72 w-64 rounded-md border border-border p-2">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof FileTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { paths: PATHS }
};

export const WithIndicators: Story = {
  args: {
    paths: PATHS,
    renderIndicator: (path) =>
      path.startsWith("scripts/") ? (
        <span aria-label="Changed" className="size-1.5 shrink-0 rounded-full bg-warning" />
      ) : null
  }
};

export const WithActionsAndFooter: Story = {
  args: {
    paths: PATHS,
    renderActions: (path) => (
      <IconButton variant="ghost" size="xs" aria-label={`Delete ${path}`}>
        <TrashIcon />
      </IconButton>
    ),
    footer: (
      <Button variant="ghost" size="xs" isFullWidth>
        <PlusIcon />
        Add File
      </Button>
    )
  }
};
