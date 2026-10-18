import { useState } from "react";

import { FileTree, type FileTreeNode } from "@app/components/v4/ui/file-tree";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const items: FileTreeNode[] = [
  {
    id: "project",
    name: "Project configuration",
    meta: "2 files",
    children: [
      { id: "env", name: "Environment variables for the production deployment", meta: "12 keys" },
      { id: "policy", name: "Access policy", icon: "lock", meta: "Restricted" }
    ]
  }
];
export default function Example() {
  const [expanded, setExpanded] = useState<string[]>(["project"]);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Files only / end truncation">
        <FileTree
          label="Selectable configuration files"
          items={items}
          selectable="files"
          truncate="end"
          expanded={expanded}
          onExpandedChange={setExpanded}
          selected={selected}
          onSelect={setSelected}
        />
        <p role="status" className="sr-only">
          Selected file: {selected ?? "none"}
        </p>
      </ExampleCell>
      <ExampleCell align="stretch" label="Browse without selection">
        <FileTree
          label="Browse configuration"
          items={items}
          selectable="none"
          defaultExpanded={["project"]}
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="Empty folder">
        <FileTree label="Empty archive" items={[]} empty="No archived configuration files" />
      </ExampleCell>
    </ExampleGrid>
  );
}
