import type { ComponentDefinition } from "./types";

export const fileTreeDefinition = {
  id: "file-tree",
  title: "File tree",
  group: "Navigation",
  summary: "A named hierarchical file and folder picker with one keyboard tab stop.",
  sourceFiles: ["src/components/v4/ui/file-tree.tsx", "src/components/v4/ui/data.module.css"],
  exports: ["FileTree", "FileTreeNode"],
  referenceNames: ["FileTree"],
  behavior: [
    "Folder/file/all/none selection modes and folders-only views.",
    "Controlled or default selection/expansion, disabled reasons and metadata.",
    "Visible rows retain focus identity while children open and close."
  ],
  accessibility: [
    "Screen readers hear each node's level, position, selection and whether it is expanded.",
    "Up/Down, Left/Right and Home/End move through the tree, typing a name jumps to it, and Enter or Space picks.",
    "Disabled nodes remain focusable for their announced explanation."
  ],
  limitations: [
    "Selected paths expand once per selected id. Controlled expansion owners must apply onExpandedChange; deliberate collapse of the same selected path is preserved. Lazy server loading belongs to the host.",
    "Rendering is recursive, not virtualized. Use bounded folder data or load branches explicitly.",
    "Names middle-fit using MiddleTruncate by default; use truncate=end for prose names."
  ],
  related: ["popover", "animated-collapse"],
  examples: [
    {
      id: "variants",
      title: "Sizes",
      module: "./examples/file-tree/variants.tsx",
      states: ["default", "disabled"]
    },
    {
      id: "states",
      title: "Selection, empty and controlled expansion",
      module: "./examples/file-tree/states.tsx",
      states: ["controlled", "empty", "keyboard"]
    },
    {
      id: "picker",
      title: "Folder picker and selected path",
      module: "./examples/file-tree/picker.tsx",
      states: ["controlled", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "size",
      expected: ["sm", "md"],
      shown: [
        {
          value: "sm",
          exampleId: "variants",
          label: "sm"
        },
        {
          value: "md",
          exampleId: "variants",
          label: "md"
        }
      ]
    },
    {
      axis: "Selection",
      expected: ["all", "files", "folders", "none"],
      shown: [
        {
          value: "all",
          exampleId: "variants",
          label: "md"
        },
        {
          value: "files",
          exampleId: "states",
          label: "Files only / end truncation"
        },
        {
          value: "folders",
          exampleId: "picker",
          label: "Choose folder"
        },
        {
          value: "none",
          exampleId: "states",
          label: "Browse without selection"
        }
      ]
    },
    {
      axis: "Truncation",
      expected: ["middle", "end"],
      shown: [
        {
          value: "middle",
          exampleId: "states",
          label: "Browse without selection"
        },
        {
          value: "end",
          exampleId: "states",
          label: "Files only / end truncation"
        }
      ]
    },
    {
      axis: "Folders only",
      expected: ["false", "true"],
      shown: [
        {
          value: "false",
          exampleId: "picker",
          label: "Selected"
        },
        {
          value: "true",
          exampleId: "picker",
          label: "Choose folder"
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use sm or md for a bounded real hierarchy. Choose all, files, folders or none from the task's permitted selection."
    ],
    avoid: [],
    decision:
      "Choose FileTree for a real folder hierarchy. Use List for a flat collection and Combobox for searching a single known resource.",
    rules: [
      {
        id: "file-tree-adverse-data",
        when: "A tree contains long names, metadata or no children.",
        do: "Keep disclosure, name and metadata readable with long synthetic paths, restricted rows and an empty folder.",
        avoid:
          "Demonstrate only short fully populated paths or encode every piece of metadata as a badge.",
        reason:
          "Ordinary short names hide clipping and make absent data hard to distinguish from failed loading.",
        evidence: ["src/components/v4/ui/file-tree.tsx"],
        detect: {
          by: "review",
          how: "Inspect the empty tree and both truncation modes at 320px and enlarged text; adjacent actions remain reachable."
        }
      },
      {
        id: "file-tree-usage",
        when: "A deep selected file is not currently visible.",
        do: "Reveal its ancestor path on a new selected identity and keep disclosure separate from selecting the row.",
        avoid:
          "Reopen a deliberately collapsed branch on every render or make a selected folder impossible to expand by pointer.",
        reason: "Selection and expansion are separate states with different user intent.",
        evidence: [
          "src/components/v4/ui/file-tree.tsx",
          "src/pages/design-system/examples/file-tree/picker.tsx"
        ],
        detect: {
          by: "review",
          how: "Select a deep file, collapse its parent and operate disclosure separately from selection. New selection reveals its path; repeated renders do not reopen a deliberately collapsed path."
        }
      },
      {
        id: "file-tree-hierarchy-not-indent",
        when: "A real folder hierarchy has controlled selection and expansion.",
        do: "Use stable ids and explicit folder semantics, choose selectable from the task and update controlled expansion when onExpandedChange fires.",
        avoid:
          "Indent a flat list to imply nonexistent parents, expand every branch after deliberate collapse or assume recursive rendering is virtualized.",
        reason:
          "The tree communicates ancestry and navigation state, so visual indentation must match real relationships.",
        detect: {
          by: "review",
          how: "Select a nested item, collapse its branch and revisit the same selection. Focus and deliberate collapse remain stable, and the allowed node kinds alone can be selected."
        },
        evidence: ["src/components/v4/ui/file-tree.tsx"]
      }
    ],
    states: [
      {
        state: "collapsed",
        guidance: "Return focus to the parent when its focused descendant becomes hidden."
      },
      {
        state: "selected",
        guidance: "Keep stable node ids and let controlled expansion apply onExpandedChange."
      }
    ],
    antiSlop: [
      {
        do: "Use folder structure that reflects actual containment.",
        avoid: "Invent folders to make a flat tag collection look hierarchical.",
        reason: "A tree's expansion and path imply parent-child relationships."
      }
    ]
  },
  checks: [
    {
      kind: "runtime",
      command:
        "npm test -- src/components/v4/ui/data-grid-model.test.ts src/components/v4/ui/specialist.test.tsx"
    },
    {
      kind: "static",
      command: "npm run type:check"
    },
    {
      kind: "browser",
      command:
        "Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery."
    }
  ]
} satisfies ComponentDefinition;
