import { FileTree, type FileTreeNode } from "@app/components/v4/ui/file-tree";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const items: FileTreeNode[] = [
  {
    id: "project",
    name: "project",
    children: [
      { id: "env", name: "application.production.environment", meta: "12 keys" },
      {
        id: "locked",
        name: "archive",
        disabled: true,
        label: "archive, access restricted",
        children: []
      }
    ]
  }
];
export default function Example() {
  return (
    <ExampleGrid width="wide">
      {(["sm", "md"] as const).map((size) => (
        <ExampleCell align="stretch" key={size} label={size}>
          <FileTree
            label={`${size} file tree`}
            size={size}
            items={items}
            defaultExpanded={["project"]}
          />
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
