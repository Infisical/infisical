import * as React from "react";

import { Button } from "@app/components/v4/ui/button";
import { FileTree, type FileTreeNode } from "@app/components/v4/ui/file-tree";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";

import { ExampleStack } from "../../example-presentation";

const items: FileTreeNode[] = [
  {
    id: "root",
    name: "project",
    children: [
      {
        id: "config",
        name: "configuration",
        children: [{ id: "env", name: "application.production.environment", meta: "12 keys" }]
      },
      { id: "shared", name: "shared", disabled: true, label: "shared, read only", children: [] },
      { id: "readme", name: "README.md" }
    ]
  }
];
export default function TreePicker() {
  const [selected, setSelected] = React.useState<string | null>("env");
  const [foldersOnly, setFoldersOnly] = React.useState(false);
  return (
    <ExampleStack>
      <Button
        variant="outline"
        aria-pressed={foldersOnly}
        onClick={() => setFoldersOnly((value) => !value)}
      >
        Folders only
      </Button>
      <div className="w-full min-w-0">
        <FileTree
          items={items}
          label="Example files"
          selected={selected}
          onSelect={setSelected}
          defaultExpanded={["root", "config"]}
          foldersOnly={foldersOnly}
          maxHeight={240}
        />
      </div>
      <p role="status" className="sr-only">
        Selected {selected ?? "none"}
      </p>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Choose folder</Button>
        </PopoverTrigger>
        <PopoverContent>
          <FileTree
            items={items}
            label="Destination folder"
            foldersOnly
            selectable="folders"
            size="sm"
            defaultExpanded={["root"]}
            onSelect={(id) => setSelected(id)}
          />
        </PopoverContent>
      </Popover>
    </ExampleStack>
  );
}
