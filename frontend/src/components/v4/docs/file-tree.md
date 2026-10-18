# File tree

A named hierarchical file and folder picker with one keyboard tab stop.

## Choose this component

Choose FileTree for a real folder hierarchy. Use List for a flat collection and Combobox for searching a single known resource.

## Usage rules

### file-tree-adverse-data

Owner: file-tree.

When a tree contains long names, metadata or no children.

Do: Keep disclosure, name and metadata readable with long synthetic paths, restricted rows and an empty folder.

Avoid: Demonstrate only short fully populated paths or encode every piece of metadata as a badge.

Why: Ordinary short names hide clipping and make absent data hard to distinguish from failed loading.

Checked by: review only. Look for: Inspect the empty tree and both truncation modes at 320px and enlarged text; adjacent actions remain reachable.

Source evidence:
- src/components/v4/ui/file-tree.tsx

### file-tree-usage

Owner: file-tree.

When a deep selected file is not currently visible.

Do: Reveal its ancestor path on a new selected identity and keep disclosure separate from selecting the row.

Avoid: Reopen a deliberately collapsed branch on every render or make a selected folder impossible to expand by pointer.

Why: Selection and expansion are separate states with different user intent.

Checked by: review only. Look for: Select a deep file, collapse its parent and operate disclosure separately from selection. New selection reveals its path; repeated renders do not reopen a deliberately collapsed path.

Source evidence:
- src/components/v4/ui/file-tree.tsx
- src/pages/design-system/examples/file-tree/picker.tsx

### file-tree-hierarchy-not-indent

Owner: file-tree.

When a real folder hierarchy has controlled selection and expansion.

Do: Use stable ids and explicit folder semantics, choose selectable from the task and update controlled expansion when onExpandedChange fires.

Avoid: Indent a flat list to imply nonexistent parents, expand every branch after deliberate collapse or assume recursive rendering is virtualized.

Why: The tree communicates ancestry and navigation state, so visual indentation must match real relationships.

Checked by: review only. Look for: Select a nested item, collapse its branch and revisit the same selection. Focus and deliberate collapse remain stable, and the allowed node kinds alone can be selected.

Source evidence:
- src/components/v4/ui/file-tree.tsx

## State guidance

- collapsed: Return focus to the parent when its focused descendant becomes hidden.
- selected: Keep stable node ids and let controlled expansion apply onExpandedChange.

## Presentation rules

Do: Use folder structure that reflects actual containment.

Avoid: Invent folders to make a flat tag collection look hierarchical.

Why: A tree's expansion and path imply parent-child relationships.

## Import and exports

- src/components/v4/ui/file-tree.tsx
- src/components/v4/ui/data.module.css

Exports: FileTree, FileTreeNode. Source TypeScript defines the API.

## Behavior

- Folder/file/all/none selection modes and folders-only views.
- Controlled or default selection/expansion, disabled reasons and metadata.
- Visible rows retain focus identity while children open and close.

## Accessibility

- Screen readers hear each node's level, position, selection and whether it is expanded.
- Up/Down, Left/Right and Home/End move through the tree, typing a name jumps to it, and Enter or Space picks.
- Disabled nodes remain focusable for their announced explanation.

## Use cases

- Use sm or md for a bounded real hierarchy. Choose all, files, folders or none from the task's permitted selection.

## Limits

- Selected paths expand once per selected id. Controlled expansion owners must apply onExpandedChange; deliberate collapse of the same selected path is preserved. Lazy server loading belongs to the host.
- Rendering is recursive, not virtualized. Use bounded folder data or load branches explicitly.
- Names middle-fit using MiddleTruncate by default; use truncate=end for prose names.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- sm: example `variants`, visible label "sm".
- md: example `variants`, visible label "md".

### Selection

- all: example `variants`, visible label "md".
- files: example `states`, visible label "Files only / end truncation".
- folders: example `picker`, visible label "Choose folder".
- none: example `states`, visible label "Browse without selection".

### Truncation

- middle: example `states`, visible label "Browse without selection".
- end: example `states`, visible label "Files only / end truncation".

### Folders only

- false: example `picker`, visible label "Selected".
- true: example `picker`, visible label "Choose folder".

## Executable examples

### Sizes

Save this example at `src/pages/design-system/examples/file-tree/variants.tsx`; its relative imports are generated for that exact path. States: default, disabled.

Registry items used: @infisical/file-tree. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { FileTree, type FileTreeNode } from "../../../../components/v4/ui/file-tree";
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
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      {(["sm", "md"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <FileTree label={`${size} file tree`} size={size} items={items} defaultExpanded={["project"]}/>
        </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
    </div>);
}
```

### Selection, empty and controlled expansion

Save this example at `src/pages/design-system/examples/file-tree/states.tsx`; its relative imports are generated for that exact path. States: controlled, empty, keyboard.

Registry items used: @infisical/file-tree. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { FileTree, type FileTreeNode } from "../../../../components/v4/ui/file-tree";
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
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <FileTree label="Selectable configuration files" items={items} selectable="files" truncate="end" expanded={expanded} onExpandedChange={setExpanded} selected={selected} onSelect={setSelected}/>
        <p role="status" className="sr-only">
          Selected file: {selected ?? "none"}
        </p>
      </div><figcaption className="text-muted-foreground text-xs">{"Files only / end truncation"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <FileTree label="Browse configuration" items={items} selectable="none" defaultExpanded={["project"]}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Browse without selection"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <FileTree label="Empty archive" items={[]} empty="No archived configuration files"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Empty folder"}</figcaption></figure>
    </div>);
}
```

### Folder picker and selected path

Save this example at `src/pages/design-system/examples/file-tree/picker.tsx`; its relative imports are generated for that exact path. States: controlled, keyboard.

Registry items used: @infisical/button, @infisical/file-tree, @infisical/popover. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { Button } from "../../../../components/v4/ui/button";
import { FileTree, type FileTreeNode } from "../../../../components/v4/ui/file-tree";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../components/v4/ui/popover";
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
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <Button variant="outline" aria-pressed={foldersOnly} onClick={() => setFoldersOnly((value) => !value)}>
        Folders only
      </Button>
      <div className="w-full min-w-0">
        <FileTree items={items} label="Example files" selected={selected} onSelect={setSelected} defaultExpanded={["root", "config"]} foldersOnly={foldersOnly} maxHeight={240}/>
      </div>
      <p role="status" className="sr-only">
        Selected {selected ?? "none"}
      </p>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Choose folder</Button>
        </PopoverTrigger>
        <PopoverContent>
          <FileTree items={items} label="Destination folder" foldersOnly selectable="folders" size="sm" defaultExpanded={["root"]} onSelect={(id) => setSelected(id)}/>
        </PopoverContent>
      </Popover>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/data-grid-model.test.ts src/components/v4/ui/specialist.test.tsx
- static: npm run type:check
- browser: Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery.
