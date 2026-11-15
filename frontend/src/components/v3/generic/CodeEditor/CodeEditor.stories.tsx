import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { CodeEditor, type CodeEditorProps } from "./CodeEditor";

const MARKDOWN = `# Release checklist

Run these steps **before** tagging a release:

1. Update \`CHANGELOG.md\`.
2. Run the test suite.
3. Open a pull request. See [the guide](https://example.com/guide).

> Ask for review from the owning team.
`;

const ControlledEditor = ({ value: initialValue, ...props }: CodeEditorProps) => {
  const [value, setValue] = useState(initialValue);
  return <CodeEditor {...props} value={value} onChange={setValue} />;
};

const meta = {
  title: "Generic/CodeEditor",
  component: CodeEditor,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  render: (args) => <ControlledEditor {...args} />,
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof CodeEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Markdown: Story = {
  args: { value: MARKDOWN, language: "markdown", className: "h-72", "aria-label": "Notes" }
};

export const PlainText: Story = {
  args: {
    value: '#!/usr/bin/env bash\nset -euo pipefail\n\necho "checking"\n',
    className: "h-48",
    "aria-label": "Script"
  }
};

export const ReadOnly: Story = {
  args: { value: MARKDOWN, language: "markdown", isReadOnly: true, className: "h-72" }
};

export const WithPlaceholder: Story = {
  args: {
    value: "",
    placeholder: "Start writing...",
    hasLineWrapping: true,
    className: "h-40",
    "aria-label": "Draft"
  }
};

export const Borderless: Story = {
  args: { value: MARKDOWN, language: "markdown", isBorderless: true, className: "h-72" },
  decorators: [
    (Story) => (
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Story />
      </div>
    )
  ]
};
